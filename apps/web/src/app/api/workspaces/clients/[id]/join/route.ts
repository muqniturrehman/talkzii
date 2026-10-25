import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** Agency admins can join any of the agency's client workspaces as an admin. */
export const POST = createHandler({ role: 'admin', feature: 'sub_accounts' }, async ({ admin, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Client workspace');
  const db = admin();
  const { data: client } = await db.from('workspaces').select('id').eq('id', id).eq('parent_workspace_id', workspace.id).maybeSingle();
  if (!client) throw ApiError.notFound('Client workspace not found.');
  const { error } = await db.from('workspace_members').upsert({ workspace_id: id, user_id: user.id, role: 'admin' }, { onConflict: 'workspace_id,user_id', ignoreDuplicates: true });
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not join the client workspace.');
  await audit({ workspaceId: id, actorId: user.id, action: 'workspace.agency_admin_joined', metadata: { agencyWorkspaceId: workspace.id }, req });
  return { workspaceId: id };
});
