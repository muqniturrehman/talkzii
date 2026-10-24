import 'server-only';
import { digitsOnly } from '@talkzi/whatsapp';
import type { Json } from '@talkzi/db';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { templateStatusFromEvent } from './processor';
import type { ApplyStatusResult, RecordInboundResult, WebhookStore } from './types';

function check(error: { message: string } | null, context: string) {
  if (error) throw new Error(`${context}: ${error.message}`);
}

/** Service-role implementation backed by the atomic SQL functions. */
export function createSupabaseWebhookStore(admin: TypedSupabaseClient): WebhookStore {
  async function wabaRow(wabaId: string) {
    const { data } = await admin.from('waba_accounts').select('id, workspace_id, metadata').eq('waba_id', wabaId).maybeSingle();
    return data;
  }

  async function phoneByDisplay(wabaId: string, displayPhoneNumber: string) {
    const waba = await wabaRow(wabaId);
    if (!waba) return null;
    const { data } = await admin
      .from('phone_numbers')
      .select('id, workspace_id, display_phone_number')
      .eq('waba_account_id', waba.id);
    const wanted = digitsOnly(displayPhoneNumber);
    return (data ?? []).find((p) => digitsOnly(p.display_phone_number) === wanted) ?? null;
  }

  return {
    async recordInboundMessage(input) {
      const { data, error } = await admin.rpc('record_inbound_message', {
        p_phone_number_id: input.phoneNumberId,
        p_wa_id: input.waId,
        p_wamid: input.wamid,
        p_type: input.type,
        p_timestamp: input.timestamp.toISOString(),
        p_profile_name: input.profileName ?? undefined,
        p_body: input.body ?? undefined,
        p_content: JSON.parse(JSON.stringify(input.content)) as Json,
        p_media: (input.media as Json) ?? undefined,
        p_reply_to_wamid: input.replyToWamid ?? undefined,
      });
      check(error, 'record_inbound_message');
      return data as unknown as RecordInboundResult;
    },

    async applyMessageStatus(input) {
      const { data, error } = await admin.rpc('apply_message_status', {
        p_wamid: input.wamid,
        p_status: input.status,
        p_timestamp: input.timestamp.toISOString(),
        p_error_code: input.errorCode ?? undefined,
        p_error_message: input.errorMessage ?? undefined,
        p_pricing_category: input.pricingCategory ?? undefined,
        p_pricing_billable: input.pricingBillable ?? undefined,
        p_pricing_model: input.pricingModel ?? undefined,
        p_pricing_type: input.pricingType ?? undefined,
        p_meta_conversation_id: input.metaConversationId ?? undefined,
        p_meta_conversation_expires_at: input.metaConversationExpiresAt?.toISOString(),
      });
      check(error, 'apply_message_status');
      return data as unknown as ApplyStatusResult;
    },

    async closeSessionWindow(conversationId, at) {
      const { error } = await admin
        .from('conversations')
        .update({ expires_at: at.toISOString() })
        .eq('id', conversationId)
        .gt('expires_at', at.toISOString());
      check(error, 'close session window');
    },

    async updateTemplateStatus(input) {
      const waba = await wabaRow(input.wabaId);
      if (!waba) return null;
      const status = templateStatusFromEvent(input.event);
      if (!status) return null;
      const { data, error } = await admin
        .from('message_templates')
        .update({
          status,
          rejected_reason: status === 'REJECTED' ? (input.reason ?? 'UNKNOWN') : null,
          ...(status === 'APPROVED' ? { approved_at: new Date().toISOString() } : {}),
          last_synced_at: new Date().toISOString(),
        })
        .eq('workspace_id', waba.workspace_id)
        .eq('meta_template_id', input.metaTemplateId)
        .select('id')
        .maybeSingle();
      check(error, 'update template status');
      return data ? { workspaceId: waba.workspace_id, templateId: data.id } : null;
    },

    async updateTemplateQuality(input) {
      const waba = await wabaRow(input.wabaId);
      if (!waba) return;
      const { error } = await admin
        .from('message_templates')
        .update({ quality_score: input.score })
        .eq('workspace_id', waba.workspace_id)
        .eq('meta_template_id', input.metaTemplateId);
      check(error, 'update template quality');
    },

    async updateTemplateCategory(input) {
      const waba = await wabaRow(input.wabaId);
      if (!waba || !input.category) return;
      const category = input.category.toUpperCase();
      if (!['MARKETING', 'UTILITY', 'AUTHENTICATION'].includes(category)) return;
      const { error } = await admin
        .from('message_templates')
        .update({ category })
        .eq('workspace_id', waba.workspace_id)
        .eq('meta_template_id', input.metaTemplateId);
      check(error, 'update template category');
    },

    async recordPhoneQuality(input) {
      const phone = await phoneByDisplay(input.wabaId, input.displayPhoneNumber);
      if (!phone) return null;
      // FLAGGED → quality dropped to red; UNFLAGGED → recovered.
      const quality = input.event === 'FLAGGED' ? 'RED' : input.event === 'UNFLAGGED' ? 'GREEN' : undefined;
      const { data, error } = await admin
        .from('phone_numbers')
        .update({
          ...(quality ? { quality_rating: quality } : {}),
          ...(input.currentLimit ? { messaging_limit_tier: input.currentLimit } : {}),
          last_synced_at: new Date().toISOString(),
        })
        .eq('id', phone.id)
        .select('quality_rating, messaging_limit_tier')
        .single();
      check(error, 'update phone quality');
      if (!data) return null;
      const { error: eventError } = await admin.from('phone_number_quality_events').insert({
        workspace_id: phone.workspace_id,
        phone_number_id: phone.id,
        event: input.event,
        quality_rating: data.quality_rating,
        messaging_limit_tier: data.messaging_limit_tier,
        payload: input.payload as Json,
      });
      check(eventError, 'insert quality event');
      return { workspaceId: phone.workspace_id, phoneRowId: phone.id, qualityRating: data.quality_rating };
    },

    async pauseBroadcastsForPhone(phoneRowId, reason) {
      const { data, error } = await admin
        .from('broadcasts')
        .update({ status: 'paused', paused_reason: reason, locked_until: null })
        .eq('phone_number_id', phoneRowId)
        .in('status', ['scheduled', 'sending'])
        .select('id');
      check(error, 'pause broadcasts');
      return data?.length ?? 0;
    },

    async updatePhoneName(input) {
      const phone = await phoneByDisplay(input.wabaId, input.displayPhoneNumber);
      if (!phone) return;
      const approved = input.decision.toUpperCase() === 'APPROVED';
      const { error } = await admin
        .from('phone_numbers')
        .update({
          name_status: approved ? 'APPROVED' : input.decision.toUpperCase(),
          ...(approved && input.requestedName ? { verified_name: input.requestedName, requested_display_name: null } : {}),
          metadata: { name_rejection_reason: input.rejectionReason } as Json,
        })
        .eq('id', phone.id);
      check(error, 'update phone name');
    },

    async updateWabaReview(input) {
      const { error } = await admin
        .from('waba_accounts')
        .update({ account_review_status: input.decision.toUpperCase() })
        .eq('waba_id', input.wabaId);
      check(error, 'update WABA review');
    },

    async recordWabaEvent(input) {
      const waba = await wabaRow(input.wabaId);
      if (!waba) return;
      const metadata = { ...((waba.metadata as Record<string, unknown> | null) ?? {}), [input.key]: input.value };
      const { error } = await admin
        .from('waba_accounts')
        .update({ metadata: metadata as Json, ...(input.status ? { status: input.status } : {}) })
        .eq('id', waba.id);
      check(error, 'record WABA event');
    },
  };
}
