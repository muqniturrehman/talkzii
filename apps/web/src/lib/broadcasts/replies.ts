import 'server-only';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

/** Replies within this window after a broadcast count towards its reply rate. */
export const REPLY_ATTRIBUTION_HOURS = 72;

/** Marks recent broadcast recipients for this contact as replied (feeds broadcast counters). */
export async function attributeBroadcastReply(admin: TypedSupabaseClient, ctx: { workspaceId: string; contactId: string }) {
  const since = new Date(Date.now() - REPLY_ATTRIBUTION_HOURS * 60 * 60 * 1000).toISOString();
  await admin
    .from('broadcast_recipients')
    .update({ replied_at: new Date().toISOString() })
    .eq('workspace_id', ctx.workspaceId)
    .eq('contact_id', ctx.contactId)
    .is('replied_at', null)
    .in('status', ['sent', 'delivered', 'read'])
    .gte('sent_at', since);
}
