import 'server-only';
import { normalizePhone, type PlanId, type PublicContactUpsertInput, type PublicSendMessageInput } from '@talkzi/shared';
import type { Json, TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { contactCapacity, planLimitError, workspaceCountryCode } from '@/lib/contacts/service';
import type { Logger } from '@/lib/logger';
import { sendMessage } from '@/lib/messaging/send';
import { messagingDeps } from '@/lib/messaging/supabase-store';
import { emitEvent } from '@/lib/outbound/emit';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

export interface PublicWorkspace {
  id: string;
  plan: PlanId;
}

const CONTACT_COLUMNS = 'id, wa_id, name, profile_name, email, opted_out, custom_fields, source, created_at, updated_at';

async function attachLabels(admin: TypedSupabaseClient, workspaceId: string, contactId: string, names: string[]) {
  const unique = [...new Set(names.map((n) => n.trim().slice(0, 50)).filter(Boolean))];
  if (!unique.length) return;
  await admin.from('labels').upsert(unique.map((name) => ({ workspace_id: workspaceId, name })), { onConflict: 'workspace_id,name', ignoreDuplicates: true });
  const { data: labels } = await admin.from('labels').select('id').eq('workspace_id', workspaceId).in('name', unique);
  if (labels?.length) {
    await admin
      .from('contact_labels')
      .upsert(labels.map((l) => ({ contact_id: contactId, label_id: l.id, workspace_id: workspaceId })), { ignoreDuplicates: true });
  }
}

/** Creates or updates a contact by phone (custom fields are merged; labels by name). */
export async function upsertContactByPhone(
  admin: TypedSupabaseClient,
  workspace: PublicWorkspace,
  input: Partial<PublicContactUpsertInput> & { phone: string },
  options: { source?: 'api' | 'integration'; log?: Logger } = {},
) {
  const waId = normalizePhone(input.phone, await workspaceCountryCode(admin, workspace.id));
  if (!waId) throw ApiError.validation({ fieldErrors: { phone: ['Enter a valid phone number with country code'] } });

  const { data: existing } = await admin.from('contacts').select(CONTACT_COLUMNS).eq('workspace_id', workspace.id).eq('wa_id', waId).maybeSingle();
  let contact = existing;
  let created = false;

  if (existing) {
    const patch: TablesUpdate<'contacts'> = {};
    if (input.name !== undefined) patch.name = input.name || null;
    if (input.email !== undefined) patch.email = input.email;
    if (input.customFields) patch.custom_fields = { ...((existing.custom_fields as Record<string, Json>) ?? {}), ...input.customFields };
    if (input.optedOut !== undefined) {
      patch.opted_out = input.optedOut;
      patch.opted_out_at = input.optedOut ? new Date().toISOString() : null;
      patch.opt_out_reason = input.optedOut ? 'Updated via API' : null;
    }
    if (Object.keys(patch).length) {
      const { data } = await admin.from('contacts').update(patch).eq('id', existing.id).select(CONTACT_COLUMNS).single();
      contact = data ?? existing;
    }
  } else {
    if ((await contactCapacity(admin, workspace)) < 1) throw planLimitError(workspace.plan);
    const { data, error } = await admin
      .from('contacts')
      .insert({
        workspace_id: workspace.id,
        wa_id: waId,
        name: input.name || null,
        email: input.email ?? null,
        custom_fields: (input.customFields ?? {}) as Json,
        opted_out: input.optedOut ?? false,
        source: options.source ?? 'api',
      })
      .select(CONTACT_COLUMNS)
      .single();
    if (error?.code === '23505') return upsertContactByPhone(admin, workspace, input, options);
    if (error || !data) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not create the contact.');
    contact = data;
    created = true;
  }

  if (input.labels?.length && contact) await attachLabels(admin, workspace.id, contact.id, input.labels);
  if (created && contact) await emitEvent(admin, workspace.id, 'contact.created', { contact }, options.log);
  return { contact: contact!, created };
}

/** Sends a text or approved template to a phone number, creating the contact and conversation as needed. */
export async function sendPublicMessage(admin: TypedSupabaseClient, workspace: PublicWorkspace, input: PublicSendMessageInput, log?: Logger) {
  const { contact } = await upsertContactByPhone(admin, workspace, { phone: input.to }, { log });

  let phoneQuery = admin.from('phone_numbers').select('id').eq('workspace_id', workspace.id);
  phoneQuery = input.phoneNumberId ? phoneQuery.eq('id', input.phoneNumberId) : phoneQuery.order('is_default', { ascending: false }).order('created_at');
  const { data: phones } = await phoneQuery.limit(1);
  const phone = phones?.[0];
  if (!phone) throw ApiError.conflict('Connect a WhatsApp number to this workspace first.', 'WHATSAPP_ERROR');

  await admin
    .from('conversations')
    .upsert({ workspace_id: workspace.id, contact_id: contact.id, phone_number_id: phone.id }, { onConflict: 'workspace_id,contact_id,phone_number_id', ignoreDuplicates: true });
  const { data: conversation } = await admin
    .from('conversations')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('contact_id', contact.id)
    .eq('phone_number_id', phone.id)
    .single();
  if (!conversation) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not open the conversation.');

  const deps = messagingDeps(admin);
  const ctx = { workspaceId: workspace.id, senderId: null, senderType: 'api' as const };
  if (input.type === 'text') {
    const sent = await sendMessage({ type: 'text', conversationId: conversation.id, text: input.text }, ctx, deps);
    return { id: sent.id, wamid: sent.wamid, status: sent.status, conversation_id: conversation.id, contact_id: contact.id };
  }

  const { data: template } = await admin
    .from('message_templates')
    .select('id')
    .eq('workspace_id', workspace.id)
    .eq('name', input.template.name)
    .eq('language', input.template.language)
    .order('approved_at', { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (!template) throw ApiError.notFound(`No template named “${input.template.name}” (${input.template.language}).`);

  const sent = await sendMessage(
    {
      type: 'template',
      conversationId: conversation.id,
      templateId: template.id,
      variables: {
        body: input.template.variables,
        header: input.template.header,
        buttons: input.template.buttons,
        headerMediaUrl: input.template.headerMediaUrl,
      },
    },
    ctx,
    deps,
  );
  return { id: sent.id, wamid: sent.wamid, status: sent.status, conversation_id: conversation.id, contact_id: contact.id };
}

/** Keyset cursor over (created_at desc, id desc). */
export function encodeCursor(row: { created_at: string; id: string }): string {
  return Buffer.from(`${row.created_at}|${row.id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { createdAt: string; id: string } | null {
  if (!cursor) return null;
  const [createdAt, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !/^[0-9a-f-]{36}$/i.test(id)) {
    throw ApiError.badRequest('Invalid cursor.');
  }
  return { createdAt, id };
}

export const cursorFilter = (c: { createdAt: string; id: string }) => `created_at.lt.${c.createdAt},and(created_at.eq.${c.createdAt},id.lt.${c.id})`;
