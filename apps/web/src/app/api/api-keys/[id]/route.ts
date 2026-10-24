import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** Revokes a key immediately (owners of personal tokens or admins, via RLS). */
export const DELETE = createHandler({ role: 'viewer' }, async ({ supabase, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'API key');
  const rows = unwrap(await supabase.from('api_keys').update({ revoked_at: new Date().toISOString() }).eq('id', id).is('revoked_at', null).select('id'));
  if (rows.length === 0) throw ApiError.notFound('API key not found.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'api_key.revoked', targetType: 'api_key', targetId: id, req });
  return { id };
});
