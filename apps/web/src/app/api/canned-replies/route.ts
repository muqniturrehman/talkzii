import { cannedReplySchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { listCannedReplies } from '@/lib/inbox/queries';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) => listCannedReplies(supabase));

export const POST = createHandler({ role: 'agent', body: cannedReplySchema }, async ({ supabase, body, workspace, user }) => {
  const { data, error } = await supabase
    .from('canned_replies')
    .insert({ workspace_id: workspace.id, shortcut: body.shortcut, title: body.title, body: body.body, created_by: user.id })
    .select('id, shortcut, title, body')
    .single();
  if (error?.code === '23505') throw ApiError.conflict(`The shortcut /${body.shortcut} is already in use.`);
  if (error) throw ApiError.forbidden();
  return data;
});
