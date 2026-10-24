import { cannedReplySchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

export const PATCH = createHandler({ role: 'agent', body: cannedReplySchema.partial() }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Canned reply');
  const { data, error } = await supabase
    .from('canned_replies')
    .update({
      ...(body.shortcut !== undefined ? { shortcut: body.shortcut } : {}),
      ...(body.title !== undefined ? { title: body.title } : {}),
      ...(body.body !== undefined ? { body: body.body } : {}),
    })
    .eq('id', id)
    .select('id, shortcut, title, body')
    .maybeSingle();
  if (error?.code === '23505') throw ApiError.conflict('That shortcut is already in use.');
  if (error) throw ApiError.forbidden();
  if (!data) throw ApiError.notFound('Canned reply not found.');
  return data;
});

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Canned reply');
  const rows = unwrap(await supabase.from('canned_replies').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Canned reply not found.');
  return { id };
});
