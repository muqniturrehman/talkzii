import { labelSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { listLabels } from '@/lib/inbox/queries';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) => listLabels(supabase));

export const POST = createHandler({ role: 'agent', body: labelSchema }, async ({ supabase, body, workspace }) => {
  const { data, error } = await supabase
    .from('labels')
    .insert({ workspace_id: workspace.id, name: body.name, color: body.color, description: body.description ?? null })
    .select('id, name, color, description')
    .single();
  if (error?.code === '23505') throw ApiError.conflict('A label with that name already exists.');
  if (error) throw ApiError.forbidden();
  return data;
});
