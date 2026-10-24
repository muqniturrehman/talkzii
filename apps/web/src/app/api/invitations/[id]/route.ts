import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';

/** Revokes a pending invitation. */
export const DELETE = createHandler({ role: 'admin' }, async ({ params, supabase, workspace, user, req }) => {
  const rows = unwrap(
    await supabase
      .from('workspace_invitations')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', params.id ?? '')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .select('id'),
  );
  if (rows.length === 0) throw ApiError.notFound('Invitation not found.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'invitation.revoked', targetType: 'invitation', targetId: params.id, req });
  return { revoked: true };
});
