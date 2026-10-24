import { runBroadcastTick } from '@/lib/broadcasts/tick';
import { createCronHandler } from '@/lib/cron';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 60;

/** Every minute (vercel.json): send the next slices of running broadcasts. */
export const GET = createCronHandler('broadcasts', async ({ log }) => runBroadcastTick(createSupabaseAdminClient(), log));
