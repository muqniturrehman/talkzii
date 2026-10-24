import { createCronHandler } from '@/lib/cron';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { refreshPendingTemplates } from '@/lib/templates/service';

export const maxDuration = 60;

/** Every 15 minutes: re-check templates still under review (backs up the webhook). */
export const GET = createCronHandler('template-status', async ({ log }) => refreshPendingTemplates(createSupabaseAdminClient(), log));
