import { createCronHandler } from '@/lib/cron';
import { processDueDeliveries } from '@/lib/outbound/emit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { runMetaEvent } from '@/lib/webhooks/meta/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_ATTEMPTS = 5;
const BATCH = 25;

/**
 * Re-processes inbound webhook events that failed (or never got processed
 * because the function died) — safe because processing is idempotent — then
 * retries outbound webhook deliveries whose backoff has elapsed.
 */
export const GET = createCronHandler('webhook-retry', async ({ startedAt, log }) => {
  const admin = createSupabaseAdminClient();
  const stale = new Date(Date.now() - 2 * 60_000).toISOString();

  const { data: events, error } = await admin
    .from('webhook_events')
    .select('id, payload, attempts, status')
    .eq('source', 'meta')
    .or(`status.eq.failed,and(status.eq.received,created_at.lt.${stale})`)
    .lt('attempts', MAX_ATTEMPTS)
    .order('created_at')
    .limit(BATCH);
  if (error) throw new Error(error.message);

  let retried = 0;
  for (const event of events ?? []) {
    if (Date.now() - startedAt > 45_000) break;
    await runMetaEvent(event.id, event.payload, event.attempts);
    retried += 1;
  }

  const outbound = Date.now() - startedAt < 40_000 ? await processDueDeliveries(admin, log) : { outboundRetried: 0, outboundDelivered: 0 };
  return { inboundRetried: retried, ...outbound };
});
