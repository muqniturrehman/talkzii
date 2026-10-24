import 'server-only';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

/** A broadcast leased for one cron tick. */
export interface ClaimedBroadcast {
  broadcastId: string;
  /** done → drop from the queue; otherwise run again on a later tick. */
  release(outcome: { done: boolean; delayMs?: number }): Promise<void>;
}

/**
 * Broadcast scheduling queue. BullMQ (REDIS_URL) holds delayed jobs and is
 * drained manually by the per-minute cron — there are no long-running
 * workers on serverless. Without Redis, the broadcasts table itself is the
 * queue (claim_due_broadcasts leases rows with SKIP LOCKED).
 */
export interface BroadcastQueue {
  readonly kind: 'bullmq' | 'postgres';
  enqueue(broadcastId: string, runAt: Date): Promise<void>;
  remove(broadcastId: string): Promise<void>;
  claimDue(limit: number): Promise<ClaimedBroadcast[]>;
  close(): Promise<void>;
}

export function createPostgresQueue(admin: TypedSupabaseClient): BroadcastQueue {
  return {
    kind: 'postgres',
    // The broadcast row (status 'scheduled' + scheduled_at) is the job.
    async enqueue() {},
    async remove() {},
    async claimDue(limit) {
      const { data, error } = await admin.rpc('claim_due_broadcasts', { p_limit: limit, p_lock_seconds: 55 });
      if (error) throw new Error(`claim_due_broadcasts failed: ${error.message}`);
      return (data ?? []).map((row) => ({
        broadcastId: row.id,
        async release({ done }) {
          if (!done) await admin.from('broadcasts').update({ locked_until: null }).eq('id', row.id);
        },
      }));
    },
    async close() {},
  };
}

const QUEUE_NAME = 'talkzi-broadcasts';

export async function createBullMqQueue(redisUrl: string, admin: TypedSupabaseClient, log: Logger): Promise<BroadcastQueue> {
  const [{ Queue, Worker }, { default: IORedis }] = await Promise.all([import('bullmq'), import('ioredis')]);
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  const queue = new Queue(QUEUE_NAME, {
    connection,
    defaultJobOptions: { removeOnComplete: 500, removeOnFail: 500, attempts: 1 },
  });
  let worker: InstanceType<typeof Worker> | null = null;

  const removeJob = async (id: string) => {
    const job = await queue.getJob(id);
    if (job) await job.remove().catch((err: unknown) => log.warn({ err, id }, 'Could not remove broadcast job'));
  };

  return {
    kind: 'bullmq',
    async enqueue(broadcastId, runAt) {
      await removeJob(broadcastId);
      await queue.add('broadcast', { broadcastId }, { jobId: broadcastId, delay: Math.max(0, runAt.getTime() - Date.now()) });
    },
    remove: removeJob,
    async claimDue(limit) {
      worker ??= new Worker(QUEUE_NAME, null, { connection, autorun: false, lockDuration: 90_000 });
      const token = crypto.randomUUID();
      const claimed: ClaimedBroadcast[] = [];
      for (let i = 0; i < limit; i++) {
        const job = await worker.getNextJob(token, { block: false });
        if (!job) break;
        const broadcastId = (job.data as { broadcastId?: string }).broadcastId ?? job.id ?? '';
        claimed.push({
          broadcastId,
          async release({ done, delayMs }) {
            if (done) await job.moveToCompleted('done', token, false);
            else await job.moveToDelayed(Date.now() + (delayMs ?? 5_000), token);
          },
        });
      }

      // Safety net: re-enqueue due broadcasts whose job went missing (e.g. Redis eviction).
      const { data: due } = await admin
        .from('broadcasts')
        .select('id, scheduled_at')
        .in('status', ['scheduled', 'sending'])
        .lte('scheduled_at', new Date().toISOString())
        .limit(20);
      for (const b of due ?? []) {
        if (claimed.some((c) => c.broadcastId === b.id)) continue;
        if (!(await queue.getJob(b.id))) {
          log.warn({ broadcastId: b.id }, 'Re-enqueued orphaned broadcast');
          await queue.add('broadcast', { broadcastId: b.id }, { jobId: b.id });
        }
      }
      return claimed;
    },
    async close() {
      await worker?.close();
      await queue.close();
      await connection.quit().catch(() => undefined);
    },
  };
}

/** BullMQ when REDIS_URL is set, otherwise the Postgres queue. */
export async function getBroadcastQueue(admin: TypedSupabaseClient, log: Logger): Promise<BroadcastQueue> {
  const url = process.env.REDIS_URL;
  if (!url) return createPostgresQueue(admin);
  try {
    return await createBullMqQueue(url, admin, log);
  } catch (error) {
    log.error({ err: error }, 'BullMQ unavailable — falling back to the Postgres queue');
    return createPostgresQueue(admin);
  }
}
