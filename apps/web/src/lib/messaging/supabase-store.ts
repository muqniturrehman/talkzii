import 'server-only';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { monthlyUsage, USAGE_METRICS } from '@/lib/billing/usage';
import { getPhoneContext } from '@/lib/meta/whatsapp';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { MessagingStore, OutboundRecord, SendDeps } from './send';

export function createSupabaseMessagingStore(admin: TypedSupabaseClient): MessagingStore {
  return {
    async getConversation(workspaceId, conversationId) {
      const { data, error } = await admin
        .from('conversations')
        .select('id, workspace_id, contact_id, phone_number_id, expires_at, contact:contacts!inner(wa_id, opted_out, name, profile_name)')
        .eq('id', conversationId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
      return data;
    },

    async getTemplate(workspaceId, templateId) {
      const { data } = await admin
        .from('message_templates')
        .select('id, name, language, category, status, components')
        .eq('id', templateId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      return data;
    },

    async getMessageWamid(workspaceId, messageId) {
      const { data } = await admin.from('messages').select('wamid').eq('id', messageId).eq('workspace_id', workspaceId).maybeSingle();
      return data?.wamid ?? null;
    },

    async recordOutbound(input) {
      const { data, error } = await admin.rpc('record_outbound_message', {
        p_workspace_id: input.workspaceId,
        p_contact_id: input.contactId,
        p_phone_number_id: input.phoneNumberRowId,
        p_type: input.type,
        p_sender_type: input.senderType,
        p_body: input.body ?? undefined,
        p_content: JSON.parse(JSON.stringify(input.content)) as Json,
        p_media: (input.media as Json) ?? undefined,
        p_status: 'queued',
        p_sender_id: input.senderId ?? undefined,
        p_template_id: input.templateId ?? undefined,
        p_broadcast_id: input.broadcastId ?? undefined,
        p_client_message_id: input.clientMessageId ?? undefined,
        p_reply_to_wamid: input.replyToWamid ?? undefined,
        p_conversation_id: input.conversationId,
      });
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not record message: ${error.message}`);
      return data as unknown as OutboundRecord;
    },

    async markSent(messageId, wamid, workspaceId) {
      const { error } = await admin
        .from('messages')
        .update({ wamid, status: 'sent', sent_at: new Date().toISOString(), error_code: null, error_message: null })
        .eq('id', messageId);
      if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
      await admin.rpc('increment_usage', { p_workspace_id: workspaceId, p_metric: USAGE_METRICS.messagesSent });
    },

    async markFailed(messageId, failure) {
      await admin
        .from('messages')
        .update({
          status: 'failed',
          failed_at: new Date().toISOString(),
          error_code: failure.code,
          error_message: failure.message.slice(0, 500),
        })
        .eq('id', messageId);
    },

    messagesSentThisMonth: (workspaceId) => monthlyUsage(admin, workspaceId, USAGE_METRICS.messagesSent),
  };
}

/** Production dependencies for sendMessage. */
export function messagingDeps(admin: TypedSupabaseClient): SendDeps {
  return {
    store: createSupabaseMessagingStore(admin),
    getClient: async (workspaceId, phoneNumberRowId) => {
      const ctx = await getPhoneContext(admin, workspaceId, phoneNumberRowId);
      return { client: ctx.client, metaPhoneNumberId: ctx.phone.phone_number_id };
    },
  };
}
