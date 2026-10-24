import 'server-only';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { processBroadcast, type ProcessResult } from './processor';
import { getBroadcastQueue } from './queue';
import { processDeps } from './supabase-store';

/**
 * One cron tick (every minute): drain due broadcasts from the queue and send
 * slices until ~45s have passed, leaving headroom under the 60s limit.
 */
export async function runBroadcastTick(admin: TypedSupabaseClient, log: Logger, budgetMs = 45_000) {
  const deadline = Date.now() + budgetMs;
  const queue = await getBroadcastQueue(admin, log);
  const results: ProcessResult[] = [];
  try {
    const claimed = await queue.claimDue(5);
    const deps = processDeps(admin, log);
    for (const item of claimed) {
      if (Date.now() >= deadline) {
        await item.release({ done: false, delayMs: 1_000 });
        continue;
      }
      try {
        const result = await processBroadcast(deps, item.broadcastId, { deadline });
        results.push(result);
        await item.release({ done: result.done || Boolean(result.paused), delayMs: result.waiting ? 5 * 60_000 : 1_000 });
      } catch (error) {
        log.error({ err: error, broadcastId: item.broadcastId }, 'Broadcast slice failed');
        await item.release({ done: false, delayMs: 30_000 });
      }
    }
  } finally {
    await queue.close();
  }
  return {
    queue: queue.kind,
    broadcasts: results.length,
    sent: results.reduce((n, r) => n + r.sent, 0),
    failed: results.reduce((n, r) => n + r.failed, 0),
    skipped: results.reduce((n, r) => n + r.skipped, 0),
    completed: results.filter((r) => r.done).length,
    paused: results.filter((r) => r.paused).length,
  };
}
