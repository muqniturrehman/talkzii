import 'server-only';
import { matchOptKeyword, resolveCompliance } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import type { Logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging/send';
import { messagingDeps } from '@/lib/messaging/supabase-store';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { InboundContext } from '@/lib/webhooks/meta/types';

/**
 * Inbound hook: a message that is exactly an opt-out keyword (STOP, BAND KARO,
 * بند کرو…) opts the contact out of marketing and ends any chatbot session;
 * an opt-in keyword reverses it. The workspace's confirmation reply is sent
 * (the customer just wrote, so the 24h window is open). Returns true when the
 * message was a keyword, so automations don't also answer it.
 */
export async function handleOptKeywords(admin: TypedSupabaseClient, ctx: InboundContext, log: Logger, send = sendMessage): Promise<boolean> {
  if (!ctx.message.text) return false;
  const { data: workspace } = await admin.from('workspaces').select('settings').eq('id', ctx.workspaceId).maybeSingle();
  const settings = resolveCompliance(workspace?.settings);
  const match = matchOptKeyword(ctx.message.text, settings);
  if (!match) return false;

  const { data: contact } = await admin.from('contacts').select('opted_out').eq('id', ctx.contactId).maybeSingle();
  if (!contact) return false;
  const optOut = match.action === 'opt_out';

  if (contact.opted_out !== optOut) {
    await admin
      .from('contacts')
      .update({ opted_out: optOut, opted_out_at: optOut ? new Date().toISOString() : null, opt_out_reason: optOut ? `Replied “${match.keyword}”` : null })
      .eq('id', ctx.contactId);
    await audit({
      workspaceId: ctx.workspaceId,
      actorType: 'webhook',
      action: optOut ? 'contact.opted_out' : 'contact.opted_in',
      targetType: 'contact',
      targetId: ctx.contactId,
      metadata: { keyword: match.keyword },
    });
  }
  if (optOut) {
    await admin.from('chatbot_sessions').update({ status: 'completed' }).eq('conversation_id', ctx.conversationId).in('status', ['active', 'waiting']);
  }

  const reply = optOut ? settings.optOutReply : settings.optInReply;
  if (reply.trim()) {
    try {
      await send(
        { type: 'text', conversationId: ctx.conversationId, text: reply, clientMessageId: `opt-${ctx.messageId}` },
        { workspaceId: ctx.workspaceId, senderId: null, senderType: 'system' },
        messagingDeps(admin),
      );
    } catch (error) {
      log.warn({ err: error, conversationId: ctx.conversationId }, 'Opt keyword confirmation reply failed');
    }
  }
  return true;
}
