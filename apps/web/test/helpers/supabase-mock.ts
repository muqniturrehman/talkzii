import { vi } from 'vitest';

export interface FakeWorkspaceRow {
  workspace_id: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  plan: 'free' | 'pro' | 'agency';
  name: string;
  slug: string;
  parent_workspace_id: string | null;
}

/**
 * Minimal stand-in for the user-scoped Supabase client used by createHandler:
 * auth.getClaims(), rpc('current_workspace_context') and a chainable `from()`
 * whose terminal result can be configured per test.
 */
export function createFakeSupabase(opts: {
  userId?: string | null;
  workspace?: FakeWorkspaceRow | null;
  signIn?: { error: { message: string; code?: string } | null };
  tableResult?: { data: unknown; error: { code?: string; message: string } | null };
}) {
  const result = opts.tableResult ?? { data: [], error: null };
  const chain: Record<string, unknown> = {};
  const passthrough = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'is', 'in', 'order', 'limit', 'range', 'match'];
  for (const method of passthrough) chain[method] = vi.fn(() => chain);
  chain.single = vi.fn(async () => result);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);

  return {
    auth: {
      getClaims: vi.fn(async () => ({
        data: opts.userId ? { claims: { sub: opts.userId, email: 'user@test.dev' } } : null,
        error: null,
      })),
      signInWithPassword: vi.fn(async () => ({ data: {}, error: opts.signIn?.error ?? null })),
      refreshSession: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    rpc: vi.fn(async (name: string) => {
      if (name === 'current_workspace_context') {
        return { data: opts.workspace ? [opts.workspace] : [], error: null };
      }
      return { data: null, error: null };
    }),
    from: vi.fn(() => chain),
    storage: { from: vi.fn() },
  };
}
