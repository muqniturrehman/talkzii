import { hasMinRole, updateMemberRoleSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';

/** Changes a member's role. Owner changes are additionally enforced in SQL. */
export const PATCH = createHandler(
  { role: 'admin', body: updateMemberRoleSchema },
  async ({ params, body, supabase, workspace, user, req }) => {
    if (body.role === 'owner' && workspace.role !== 'owner') throw ApiError.forbidden('Only owners can grant ownership.');
    const rows = unwrap(
      await supabase
        .from('workspace_members')
        .update({ role: body.role })
        .eq('workspace_id', workspace.id)
        .eq('user_id', params.userId ?? '')
        .select('user_id, role'),
    );
    if (rows.length === 0) throw ApiError.notFound('Member not found.');
    await audit({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'member.role_changed',
      targetType: 'user',
      targetId: params.userId,
      metadata: { role: body.role },
      req,
    });
    return rows[0];
  },
);

/** Removes a member (admins), or leaves the workspace (yourself). */
export const DELETE = createHandler({}, async ({ params, supabase, workspace, user, req }) => {
  const targetId = params.userId ?? '';
  const self = targetId === user.id;
  if (!self && !hasMinRole(workspace.role, 'admin')) throw ApiError.forbidden();

  const rows = unwrap(
    await supabase
      .from('workspace_members')
      .delete()
      .eq('workspace_id', workspace.id)
      .eq('user_id', targetId)
      .select('user_id'),
  );
  if (rows.length === 0) throw ApiError.notFound('Member not found.');
  await audit({
    workspaceId: workspace.id,
    actorId: user.id,
    action: self ? 'member.left' : 'member.removed',
    targetType: 'user',
    targetId,
    req,
  });
  if (self) await supabase.auth.refreshSession();
  return { removed: true };
});
