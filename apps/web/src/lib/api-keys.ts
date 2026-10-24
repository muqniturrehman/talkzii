import 'server-only';
import { randomInt } from 'node:crypto';
import { API_KEY_PREFIX, API_SCOPE_META, hasMinRole, type ApiScope, type PlanId, type WorkspaceRole } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { sha256Hex } from '@/lib/crypto';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';

/** tk_live_ + 32 base62 chars. Only the SHA-256 hash is stored; the key is shown once. */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  let secret = '';
  for (let i = 0; i < 32; i++) secret += ALPHABET[randomInt(ALPHABET.length)];
  const key = `${API_KEY_PREFIX}${secret}`;
  return { key, prefix: key.slice(0, API_KEY_PREFIX.length + 4), hash: sha256Hex(key) };
}

export interface ApiKeyContext {
  keyId: string;
  workspace: { id: string; name: string; plan: PlanId };
  scopes: ApiScope[];
  /** Personal tokens act as their user, limited by that user's role. */
  userId: string | null;
  role: WorkspaceRole | null;
}

export function bearerToken(header: string | null): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header ?? '');
  return match?.[1] ?? null;
}

/** Resolves a bearer key to its workspace and scopes, or throws 401. */
export async function authenticateApiKey(admin: TypedSupabaseClient, token: string | null): Promise<ApiKeyContext> {
  if (!token || !token.startsWith(API_KEY_PREFIX)) throw ApiError.unauthorized('Send your API key as "Authorization: Bearer tk_live_…".');
  const { data: key } = await admin
    .from('api_keys')
    .select('id, workspace_id, user_id, scopes, revoked_at, expires_at, last_used_at, workspace:workspaces(id, name, plan)')
    .eq('key_hash', sha256Hex(token))
    .maybeSingle();
  if (!key || key.revoked_at || !key.workspace) throw ApiError.unauthorized('This API key is invalid or has been revoked.');
  if (key.expires_at && new Date(key.expires_at) < new Date()) throw ApiError.unauthorized('This API key has expired.');

  let role: WorkspaceRole | null = null;
  if (key.user_id) {
    const { data: member } = await admin
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', key.workspace_id)
      .eq('user_id', key.user_id)
      .maybeSingle();
    if (!member) throw ApiError.unauthorized('The owner of this personal token is no longer a member of the workspace.');
    role = member.role;
  }

  // Throttle last_used_at writes to one every 5 minutes per key.
  if (!key.last_used_at || Date.now() - new Date(key.last_used_at).getTime() > 5 * 60_000) {
    await admin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', key.id);
  }

  return { keyId: key.id, workspace: key.workspace, scopes: key.scopes as ApiScope[], userId: key.user_id, role };
}

export function assertScope(ctx: ApiKeyContext, scope: ApiScope) {
  if (!ctx.scopes.includes(scope)) throw ApiError.forbidden(`This API key is missing the ${scope} scope.`);
  if (ctx.role && !hasMinRole(ctx.role, API_SCOPE_META[scope].minRole)) {
    throw ApiError.forbidden(`Your role (${ctx.role}) cannot use ${scope}.`);
  }
}
