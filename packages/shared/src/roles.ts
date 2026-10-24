export const WORKSPACE_ROLES = ['owner', 'admin', 'agent', 'viewer'] as const;
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  owner: 4,
  admin: 3,
  agent: 2,
  viewer: 1,
};

export function hasMinRole(role: WorkspaceRole | null | undefined, minimum: WorkspaceRole): boolean {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}

export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return typeof value === 'string' && (WORKSPACE_ROLES as readonly string[]).includes(value);
}

export const ROLE_META: Record<WorkspaceRole, { label: string; description: string }> = {
  owner: { label: 'Owner', description: 'Full access including billing, deletion and managing owners.' },
  admin: { label: 'Admin', description: 'Manage numbers, templates, broadcasts, bots, integrations and team.' },
  agent: { label: 'Agent', description: 'Chat with customers, manage contacts, notes and labels.' },
  viewer: { label: 'Viewer', description: 'Read-only access to conversations and analytics.' },
};

/**
 * Minimum role per dashboard route prefix (first match wins). Enforced in the
 * proxy (fast path, from the JWT claim) and again by pages and APIs (live
 * membership) — RLS is the final authority.
 */
export const ROUTE_MIN_ROLES: ReadonlyArray<{ prefix: string; role: WorkspaceRole }> = [
  { prefix: '/app/settings/billing', role: 'admin' },
  { prefix: '/app/settings/branding', role: 'admin' },
  { prefix: '/app/settings/compliance', role: 'admin' },
  { prefix: '/app/settings/general', role: 'admin' },
  { prefix: '/app/sessions', role: 'admin' },
  { prefix: '/app/integrations', role: 'admin' },
  { prefix: '/app/templates/new', role: 'admin' },
  { prefix: '/app/broadcasts/new', role: 'admin' },
];

export function requiredRoleForPath(pathname: string): WorkspaceRole | null {
  return ROUTE_MIN_ROLES.find((rule) => pathname === rule.prefix || pathname.startsWith(`${rule.prefix}/`))?.role ?? null;
}
