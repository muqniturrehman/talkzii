import { updateContactSchema } from '@talkzi/shared';
import type { Json, TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getContactDetail } from '@/lib/contacts/service';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) => getContactDetail(supabase, requireUuid(params.id, 'Contact')));

export const PATCH = createHandler({ role: 'agent', body: updateContactSchema }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Contact');
  const patch: TablesUpdate<'contacts'> = {};
  if (body.name !== undefined) patch.name = body.name || null;
  if (body.email !== undefined) patch.email = body.email || null;
  if (body.locale !== undefined) patch.locale = body.locale || null;
  if (body.customFields !== undefined) patch.custom_fields = body.customFields as Json;
  if (body.optedOut !== undefined) {
    patch.opted_out = body.optedOut;
    patch.opted_out_at = body.optedOut ? new Date().toISOString() : null;
    patch.opt_out_reason = body.optedOut ? (body.optOutReason ?? 'Marked by agent') : null;
  }
  const row = unwrap(await supabase.from('contacts').update(patch).eq('id', id).select('id').maybeSingle());
  if (!row) throw ApiError.notFound('Contact not found.');
  return getContactDetail(supabase, id);
});

/** Deletes the contact with its conversations, messages and notes (admin). */
export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Contact');
  const rows = unwrap(await supabase.from('contacts').delete().eq('id', id).select('id, wa_id'));
  if (rows.length === 0) throw ApiError.notFound('Contact not found.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'contact.deleted', targetType: 'contact', targetId: id, req });
  return { id };
});
