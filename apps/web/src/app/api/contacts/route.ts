import { after } from 'next/server';
import { contactListQuerySchema, createContactSchema, normalizePhone } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { contactCapacity, listContacts, planLimitError, workspaceCountryCode } from '@/lib/contacts/service';
import { emitEvent } from '@/lib/outbound/emit';

export const GET = createHandler({ role: 'viewer', query: contactListQuerySchema }, async ({ supabase, query }) =>
  listContacts(supabase, query),
);

export const POST = createHandler({ role: 'agent', body: createContactSchema }, async ({ supabase, admin, body, workspace, user, log }) => {
  const waId = normalizePhone(body.phone, await workspaceCountryCode(supabase, workspace.id));
  if (!waId) throw ApiError.validation({ fieldErrors: { phone: ['Enter a valid phone number with country code'] } });

  const { data: existing } = await supabase.from('contacts').select('id').eq('wa_id', waId).maybeSingle();
  if (existing) throw ApiError.conflict('A contact with this number already exists.', 'CONFLICT', { id: existing.id });
  if ((await contactCapacity(admin(), workspace)) < 1) throw planLimitError(workspace.plan);

  const { data: contact, error } = await supabase
    .from('contacts')
    .insert({
      workspace_id: workspace.id,
      wa_id: waId,
      name: body.name || null,
      email: body.email ?? null,
      custom_fields: (body.customFields ?? {}) as Json,
      source: 'manual',
      created_by: user.id,
    })
    .select('id, wa_id, name')
    .single();
  if (error?.code === '23505') throw ApiError.conflict('A contact with this number already exists.');
  if (error || !contact) throw ApiError.forbidden();

  if (body.labelIds?.length) {
    await supabase
      .from('contact_labels')
      .upsert(body.labelIds.map((labelId) => ({ contact_id: contact.id, label_id: labelId, workspace_id: workspace.id })), { ignoreDuplicates: true });
  }
  after(() => emitEvent(admin(), workspace.id, 'contact.created', { contact: { ...contact, phone: `+${contact.wa_id}` } }, log));
  return contact;
});
