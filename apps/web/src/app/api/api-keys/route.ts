import { createApiKeySchema, hasMinRole } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { generateApiKey } from '@/lib/api-keys';
import { audit } from '@/lib/audit';

const COLUMNS = 'id, name, prefix, scopes, user_id, expires_at, last_used_at, revoked_at, created_at';

/** Admins see every key; other members see their personal tokens (RLS). */
export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) =>
  unwrap(await supabase.from('api_keys').select(COLUMNS).is('revoked_at', null).order('created_at', { ascending: false })),
);

/** Creates a key and returns it once. Workspace keys need admin + api_access; personal tokens any member. */
export const POST = createHandler({ role: 'viewer', feature: 'api_access', body: createApiKeySchema }, async ({ supabase, body, workspace, user, req }) => {
  if (!body.personal && !hasMinRole(workspace.role, 'admin')) throw ApiError.forbidden('Only admins can create workspace API keys.');
  const { key, prefix, hash } = generateApiKey();
  const expiresAt = body.expiresInDays ? new Date(Date.now() + body.expiresInDays * 86_400_000).toISOString() : null;
  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      workspace_id: workspace.id,
      name: body.name,
      prefix,
      key_hash: hash,
      scopes: body.scopes,
      user_id: body.personal ? user.id : null,
      expires_at: expiresAt,
      created_by: user.id,
    })
    .select(COLUMNS)
    .single();
  if (error || !data) throw ApiError.forbidden();
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'api_key.created', targetType: 'api_key', targetId: data.id, metadata: { personal: body.personal, scopes: body.scopes }, req });
  return { ...data, key };
});
