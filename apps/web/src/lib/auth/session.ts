import 'server-only';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { cache } from 'react';
import { hasMinRole, type WorkspaceRole } from '@talkzi/shared';
import type { Profile, Workspace } from '@talkzi/db';
import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/public-env';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type WorkspaceSummary = Pick<
  Workspace,
  'id' | 'name' | 'slug' | 'logo_url' | 'plan' | 'branding' | 'parent_workspace_id' | 'timezone' | 'default_country_code' | 'custom_domain'
> & { role: WorkspaceRole };

export interface SessionContext {
  user: { id: string; email: string | null };
  profile: Profile | null;
  memberships: WorkspaceSummary[];
  workspace: WorkspaceSummary | null;
}

const WORKSPACE_FIELDS =
  'id, name, slug, logo_url, plan, branding, parent_workspace_id, timezone, default_country_code, custom_domain';

/**
 * Request-scoped session for Server Components: verified user, profile,
 * memberships and the active workspace (claim → profile → first membership).
 */
export const getSession = cache(async (): Promise<SessionContext | null> => {
  // Sessions are per request: never let a build without Supabase env vars
  // prerender a signed-out page (a static redirect to /login).
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;

  const userId = claims.sub;
  const [profileRes, membershipsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
    supabase.from('workspace_members').select(`role, workspace:workspaces!inner(${WORKSPACE_FIELDS})`).eq('user_id', userId),
  ]);

  const memberships: WorkspaceSummary[] = (membershipsRes.data ?? [])
    .map((row) => (row.workspace ? { ...row.workspace, role: row.role } : null))
    .filter((w): w is WorkspaceSummary => w !== null)
    .sort((a, b) => a.name.localeCompare(b.name));

  const profile = profileRes.data ?? null;
  const claimed = typeof claims.workspace_id === 'string' ? claims.workspace_id : null;
  const active =
    memberships.find((m) => m.id === claimed) ??
    memberships.find((m) => m.id === profile?.active_workspace_id) ??
    memberships[0] ??
    null;

  // Keep the DB's notion of the active workspace consistent with ours (RLS falls back to it).
  if (active && active.id !== claimed && active.id !== profile?.active_workspace_id) {
    const { error } = await supabase.rpc('switch_workspace', { p_workspace_id: active.id });
    if (error) logger.warn({ err: error }, 'Failed to persist active workspace');
  }

  return {
    user: { id: userId, email: typeof claims.email === 'string' ? claims.email : null },
    profile,
    memberships,
    workspace: active,
  };
});

export async function requireSession(nextPath = '/app'): Promise<SessionContext> {
  const session = await getSession();
  if (!session) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return session;
}

export async function requireWorkspace(
  nextPath = '/app',
): Promise<SessionContext & { workspace: WorkspaceSummary }> {
  const session = await requireSession(nextPath);
  if (!session.workspace) redirect('/onboarding');
  return session as SessionContext & { workspace: WorkspaceSummary };
}

export async function requireRole(
  minimum: WorkspaceRole,
  nextPath = '/app',
): Promise<SessionContext & { workspace: WorkspaceSummary }> {
  const session = await requireWorkspace(nextPath);
  if (!hasMinRole(session.workspace.role, minimum)) redirect('/app?denied=1');
  return session;
}
