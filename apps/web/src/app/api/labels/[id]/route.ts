import { labelSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';

export const PATCH = createHandler({ role: 'admin', body: labelSchema.partial() }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Label');
  const { data, error } = await supabase
    .from('labels')
    .update({
      ...(body.name !== undefined ? { name: body.name } : {}),
      ...(body.color !== undefined ? { color: body.color } : {}),
      ...(body.description !== undefined ? { description: body.description } : {}),
    })
    .eq('id', id)
    .select('id, name, color, description')
    .maybeSingle();
  if (error?.code === '23505') throw ApiError.conflict('A label with that name already exists.');
  if (error) throw ApiError.forbidden();
  if (!data) throw ApiError.notFound('Label not found.');
  return data;
});

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Label');
  const rows = unwrap(await supabase.from('labels').delete().eq('id', id).select('id'));
  if (rows.length === 0) throw ApiError.notFound('Label not found.');
  return { id };
});
