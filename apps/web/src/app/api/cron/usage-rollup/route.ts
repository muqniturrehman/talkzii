import { createCronHandler } from '@/lib/cron';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Hourly: ends prepaid wallet/manual plans whose period ran out (the workspace
 * falls back to Free) and reconciles the monthly messages_sent counters.
 */
export const GET = createCronHandler('usage-rollup', async () => {
  const admin = createSupabaseAdminClient();
  const [expired, rollup] = await Promise.all([admin.rpc('expire_prepaid_subscriptions'), admin.rpc('rollup_usage', {})]);
  if (expired.error) throw new Error(expired.error.message);
  if (rollup.error) throw new Error(rollup.error.message);
  return { expiredSubscriptions: expired.data?.length ?? 0, countersRaised: rollup.data ?? 0 };
});
