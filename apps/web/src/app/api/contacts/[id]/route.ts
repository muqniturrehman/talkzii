import { updateContactSchema } from '@talkzi/shared';
import type { Json, TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { eraseContact } from '@/lib/compliance/deletion';
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

/**
 * Erases the contact (right to erasure): media files, then the contact with
 * its conversations, messages and notes. Returns a confirmation code (admin).
 */
export const DELETE = createHandler({ role: 'admin' }, async ({ admin, params, workspace, user }) =>
  eraseContact(admin(), { workspaceId: workspace.id, contactId: requireUuid(params.id, 'Contact'), actorId: user.id }),
);
