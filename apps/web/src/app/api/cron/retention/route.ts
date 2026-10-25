import { runRetention } from '@/lib/compliance/retention';
import { createCronHandler } from '@/lib/cron';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Daily: applies each workspace's message retention and clears old platform logs. */
export const GET = createCronHandler('retention', async ({ startedAt, log }) => runRetention(createSupabaseAdminClient(), log, startedAt + 270_000));
