import { z } from 'zod';
import { labelLinkSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { contactLabels } from '@/lib/contacts/service';

export const POST = createHandler({ role: 'agent', body: labelLinkSchema }, async ({ supabase, params, body, workspace }) => {
  const id = requireUuid(params.id, 'Contact');
  const [{ data: contact }, { data: label }] = await Promise.all([
    supabase.from('contacts').select('id').eq('id', id).maybeSingle(),
    supabase.from('labels').select('id').eq('id', body.labelId).maybeSingle(),
  ]);
  if (!contact) throw ApiError.notFound('Contact not found.');
  if (!label) throw ApiError.notFound('Label not found.');
  const { error } = await supabase
    .from('contact_labels')
    .upsert({ contact_id: id, label_id: body.labelId, workspace_id: workspace.id }, { ignoreDuplicates: true });
  if (error) throw ApiError.forbidden();
  return contactLabels(supabase, id);
});

export const DELETE = createHandler({ role: 'agent', query: z.object({ labelId: z.uuid() }) }, async ({ supabase, params, query }) => {
  const id = requireUuid(params.id, 'Contact');
  const { error } = await supabase.from('contact_labels').delete().eq('contact_id', id).eq('label_id', query.labelId);
  if (error) throw ApiError.forbidden();
  return contactLabels(supabase, id);
});
