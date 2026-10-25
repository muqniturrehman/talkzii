import { createClientWorkspaceSchema, planLimit } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** The agency's client workspaces, with member counts and whether you're a member. */
export const GET = createHandler({ role: 'admin', feature: 'sub_accounts' }, async ({ admin, workspace, user }) => {
  const db = admin();
  const { data: clients, error } = await db
    .from('workspaces')
    .select('id, name, slug, logo_url, created_at')
    .eq('parent_workspace_id', workspace.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  const ids = (clients ?? []).map((c) => c.id);
  const { data: members } = ids.length ? await db.from('workspace_members').select('workspace_id, user_id').in('workspace_id', ids) : { data: [] };
  return (clients ?? []).map((c) => {
    const rows = (members ?? []).filter((m) => m.workspace_id === c.id);
    return { ...c, memberCount: rows.length, isMember: rows.some((m) => m.user_id === user.id) };
  });
});

/** Creates a client workspace on the agency's plan; you become its owner. */
export const POST = createHandler({ role: 'admin', feature: 'sub_accounts', body: createClientWorkspaceSchema }, async ({ admin, body, workspace, user, req }) => {
  if (workspace.parentWorkspaceId) throw ApiError.conflict('Client workspaces can’t have clients of their own.');
  const db = admin();
  const limit = planLimit(workspace.plan, 'client_workspaces');
  if (Number.isFinite(limit)) {
    const { count } = await db.from('workspaces').select('id', { count: 'exact', head: true }).eq('parent_workspace_id', workspace.id);
    if ((count ?? 0) >= limit) {
      throw new ApiError(403, 'PLAN_LIMIT', `Your plan includes ${limit} client workspace${limit === 1 ? '' : 's'}.`, { limit: 'client_workspaces' });
    }
  }
  const { data, error } = await db.rpc('create_client_workspace', {
    p_parent_id: workspace.id,
    p_user_id: user.id,
    p_name: body.name,
    p_timezone: body.timezone,
    p_default_country_code: body.defaultCountryCode,
  });
  if (error?.message.includes('forbidden')) throw ApiError.forbidden();
  if (error || !data) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not create the client workspace.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.client_created', targetType: 'workspace', targetId: data.id, metadata: { name: body.name }, req });
  return { id: data.id, name: data.name, slug: data.slug };
});
