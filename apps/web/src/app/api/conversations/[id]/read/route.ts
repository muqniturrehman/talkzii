import { after } from 'next/server';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { getPhoneContext } from '@/lib/meta/whatsapp';

/**
 * Clears the unread badge and (after responding) sends a read receipt for the
 * latest inbound message so the customer sees blue ticks.
 */
export const POST = createHandler({ role: 'agent' }, async ({ supabase, params, workspace, admin, log }) => {
  const id = requireUuid(params.id, 'Conversation');
  const { data: conversation } = await supabase
    .from('conversations')
    .select('id, unread_count, phone_number_id')
    .eq('id', id)
    .maybeSingle();
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  if (conversation.unread_count === 0) return { ok: true, receipt: false };

  const { error } = await supabase.from('conversations').update({ unread_count: 0 }).eq('id', id);
  if (error) throw ApiError.forbidden();

  after(async () => {
    try {
      const db = admin();
      const { data: last } = await db
        .from('messages')
        .select('wamid')
        .eq('workspace_id', workspace.id)
        .eq('conversation_id', id)
        .eq('direction', 'inbound')
        .not('wamid', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!last?.wamid) return;
      const ctx = await getPhoneContext(db, workspace.id, conversation.phone_number_id);
      await ctx.client.markAsRead(ctx.phone.phone_number_id, last.wamid);
    } catch (err) {
      log.warn({ err }, 'Read receipt failed');
    }
  });

  return { ok: true, receipt: true };
});
