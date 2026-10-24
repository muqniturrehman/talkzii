import 'server-only';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { getPhoneContext } from '@/lib/meta/whatsapp';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { LaunchStore } from './launch';
import type { BroadcastStore, ProcessContactRow, ProcessDeps } from './processor';

export const BROADCAST_USAGE_METRIC = 'broadcast_recipients';
const monthStart = () => `${new Date().toISOString().slice(0, 7)}-01`;

function check(error: { message: string } | null, what: string) {
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', `${what}: ${error.message}`);
}

export function createLaunchStore(db: TypedSupabaseClient): LaunchStore {
  return {
    async getBroadcast(workspaceId, id) {
      const { data } = await db
        .from('broadcasts')
        .select('id, status, template_id, phone_number_id, variable_mapping')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      return data;
    },
    async getTemplate(workspaceId, id) {
      const { data } = await db
        .from('message_templates')
        .select('id, name, language, category, status, components')
        .eq('id', id)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      return data;
    },
    async getPhone(workspaceId, id) {
      let query = db.from('phone_numbers').select('id, quality_rating, status').eq('workspace_id', workspaceId);
      query = id ? query.eq('id', id) : query.order('is_default', { ascending: false }).order('created_at');
      const { data } = await query.limit(1);
      return data?.[0] ?? null;
    },
    async recipientsUsedThisMonth(workspaceId) {
      const { data } = await db
        .from('usage_counters')
        .select('value')
        .eq('workspace_id', workspaceId)
        .eq('metric', BROADCAST_USAGE_METRIC)
        .eq('period', monthStart())
        .maybeSingle();
      return Number(data?.value ?? 0);
    },
    async materialize(broadcastId, maxRecipients) {
      const { data, error } = await db.rpc('materialize_broadcast_recipients', {
        p_broadcast_id: broadcastId,
        p_max_recipients: maxRecipients ?? undefined,
      });
      if (error) throw new Error(error.message);
      return data as { total: number; sendable: number; skipped: number };
    },
    async markScheduled(broadcastId, patch) {
      const { error } = await db
        .from('broadcasts')
        .update({
          status: 'scheduled',
          scheduled_at: patch.scheduledAt,
          phone_number_id: patch.phoneNumberId,
          template_name: patch.templateName,
          template_language: patch.templateLanguage,
          estimated_cost: patch.estimatedCost,
          paused_reason: null,
          locked_until: null,
        })
        .eq('id', broadcastId);
      check(error, 'schedule broadcast');
    },
    async recordUsage(workspaceId, recipients) {
      await db.rpc('increment_usage', { p_workspace_id: workspaceId, p_metric: BROADCAST_USAGE_METRIC, p_amount: recipients });
    },
  };
}

export function createBroadcastStore(db: TypedSupabaseClient): BroadcastStore {
  return {
    async getBroadcast(id) {
      const { data } = await db
        .from('broadcasts')
        .select('id, workspace_id, status, phone_number_id, variable_mapping, template:message_templates(id, name, language, category, status, components)')
        .eq('id', id)
        .maybeSingle();
      return data;
    },
    async getPhone(workspaceId, phoneRowId) {
      const { data } = await db
        .from('phone_numbers')
        .select('id, phone_number_id, quality_rating, messaging_limit_tier')
        .eq('id', phoneRowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      return data;
    },
    async sentInLast24h(phoneRowId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await db
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('phone_number_id', phoneRowId)
        .eq('sender_type', 'broadcast')
        .gte('created_at', since)
        .neq('status', 'failed');
      return count ?? 0;
    },
    async markSending(broadcastId) {
      await db
        .from('broadcasts')
        .update({ status: 'sending', started_at: new Date().toISOString() })
        .eq('id', broadcastId)
        .eq('status', 'scheduled');
    },
    async claimRecipients(broadcastId, limit) {
      const { data, error } = await db.rpc('claim_broadcast_recipients', { p_broadcast_id: broadcastId, p_limit: limit });
      check(error, 'claim recipients');
      return (data ?? []).map((r) => ({ id: r.id, contact_id: r.contact_id, wa_id: r.wa_id, attempts: r.attempts }));
    },
    async getContacts(workspaceId, ids) {
      const map = new Map<string, ProcessContactRow>();
      if (ids.length === 0) return map;
      const { data, error } = await db
        .from('contacts')
        .select('id, name, profile_name, wa_id, custom_fields, opted_out')
        .eq('workspace_id', workspaceId)
        .in('id', ids);
      check(error, 'load contacts');
      for (const c of data ?? []) map.set(c.id, c);
      return map;
    },
    async recordMessage(input) {
      const { data, error } = await db.rpc('record_outbound_message', {
        p_workspace_id: input.workspaceId,
        p_contact_id: input.contactId,
        p_phone_number_id: input.phoneNumberRowId,
        p_type: 'template',
        p_sender_type: 'broadcast',
        p_body: input.body,
        p_content: input.content as Json,
        p_status: 'queued',
        p_template_id: input.templateId,
        p_broadcast_id: input.broadcastId,
        p_client_message_id: input.clientMessageId,
      });
      check(error, 'record broadcast message');
      const record = data as unknown as { id: string; status: string; wamid: string | null; duplicate: boolean };
      return record;
    },
    async markSent({ recipientId, messageId, wamid }) {
      const sentAt = new Date().toISOString();
      const [m, r] = await Promise.all([
        db.from('messages').update({ wamid, status: 'sent', sent_at: sentAt }).eq('id', messageId).in('status', ['queued', 'failed']),
        db
          .from('broadcast_recipients')
          .update({ status: 'sent', wamid, message_id: messageId, sent_at: sentAt, error_code: null, error_message: null })
          .eq('id', recipientId),
      ]);
      check(m.error, 'mark message sent');
      check(r.error, 'mark recipient sent');
    },
    async markFailed({ recipientId, messageId, code, message }) {
      const failedAt = new Date().toISOString();
      await Promise.all([
        messageId
          ? db.from('messages').update({ status: 'failed', failed_at: failedAt, error_code: code, error_message: message.slice(0, 500) }).eq('id', messageId)
          : Promise.resolve(),
        db
          .from('broadcast_recipients')
          .update({ status: 'failed', failed_at: failedAt, error_code: code, error_message: message.slice(0, 500), message_id: messageId })
          .eq('id', recipientId),
      ]);
    },
    async retryLater(recipientId, at, message) {
      await db
        .from('broadcast_recipients')
        .update({ status: 'pending', next_attempt_at: at.toISOString(), error_message: message.slice(0, 500) })
        .eq('id', recipientId);
    },
    async skip(recipientId, reason) {
      await db.from('broadcast_recipients').update({ status: 'skipped', error_message: reason }).eq('id', recipientId);
    },
    async markContactOptedOut(contactId, reason) {
      await db
        .from('contacts')
        .update({ opted_out: true, opted_out_at: new Date().toISOString(), opt_out_reason: reason })
        .eq('id', contactId)
        .eq('opted_out', false);
    },
    async pause(broadcastId, reason) {
      await db
        .from('broadcasts')
        .update({ status: 'paused', paused_reason: reason, locked_until: null })
        .eq('id', broadcastId)
        .in('status', ['scheduled', 'sending']);
    },
    async completeIfDone(broadcastId) {
      const { data, error } = await db.rpc('complete_broadcast_if_done', { p_broadcast_id: broadcastId });
      check(error, 'complete broadcast');
      return Boolean(data);
    },
  };
}

export function processDeps(db: TypedSupabaseClient, log: ProcessDeps['log']): ProcessDeps {
  return {
    store: createBroadcastStore(db),
    getClient: async (workspaceId, phoneRowId) => (await getPhoneContext(db, workspaceId, phoneRowId)).client,
    log,
  };
}
