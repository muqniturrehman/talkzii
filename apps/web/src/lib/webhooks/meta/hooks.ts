import 'server-only';
import { attributeBroadcastReply } from '@/lib/broadcasts/replies';
import { handleChatbotInbound } from '@/lib/chatbots/runtime';
import { handleOptKeywords } from '@/lib/compliance/opt-keywords';
import { emitEvent } from '@/lib/outbound/emit';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { WebhookHooks } from './types';

/**
 * Post-persistence side effects for Meta webhooks. Each concern lives in its
 * own module and is composed here; the processor isolates hook failures so a
 * failing side effect never fails the webhook.
 */
export function createWebhookHooks(admin: TypedSupabaseClient, log: Logger): WebhookHooks {
  return {
    async onInboundMessage(ctx) {
      await attributeBroadcastReply(admin, ctx);
      const { count } = await admin
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('conversation_id', ctx.conversationId)
        .eq('direction', 'inbound');
      if ((count ?? 0) <= 1) {
        await emitEvent(admin, ctx.workspaceId, 'conversation.created', { conversation_id: ctx.conversationId, contact_id: ctx.contactId, wa_id: ctx.contactWaId }, log);
      }
      await emitEvent(
        admin,
        ctx.workspaceId,
        'message.received',
        {
          message_id: ctx.messageId,
          conversation_id: ctx.conversationId,
          contact: { id: ctx.contactId, wa_id: ctx.contactWaId, profile_name: ctx.profileName },
          type: ctx.message.type,
          text: ctx.message.text,
          reply_id: ctx.message.interactive?.id ?? ctx.message.button?.payload ?? null,
          wamid: ctx.message.wamid,
          timestamp: ctx.message.timestamp.toISOString(),
        },
        log,
      );
      // STOP / START keywords are answered by compliance, not by automations.
      if (await handleOptKeywords(admin, ctx, log)) return;
      await handleChatbotInbound(admin, ctx, log);
    },
    async onStatus(ctx) {
      await emitEvent(
        admin,
        ctx.workspaceId,
        'message.status',
        {
          message_id: ctx.messageId,
          conversation_id: ctx.conversationId,
          broadcast_id: ctx.broadcastId,
          wamid: ctx.status.wamid,
          status: ctx.status.status,
          timestamp: ctx.status.timestamp.toISOString(),
          errors: ctx.status.errors.map((e) => ({ code: e.code, title: e.title })),
        },
        log,
      );
    },
    async onTemplateStatus(ctx) {
      await emitEvent(admin, ctx.workspaceId, 'template.status', { template_id: ctx.templateId, status: ctx.status, reason: ctx.reason }, log);
    },
  };
}
