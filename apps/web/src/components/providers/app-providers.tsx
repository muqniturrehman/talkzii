'use client';

import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { hasMinRole, type Branding, type PlanId, type WorkspaceRole } from '@talkzi/shared';

export interface AppWorkspace {
  id: string;
  name: string;
  slug: string;
  role: WorkspaceRole;
  plan: PlanId;
  logoUrl: string | null;
  timezone: string;
  defaultCountryCode: string;
  branding: Branding;
  parentWorkspaceId: string | null;
}

export interface AppUser {
  id: string;
  email: string | null;
  fullName: string | null;
  avatarUrl: string | null;
}

export interface AppMembership {
  id: string;
  name: string;
  role: WorkspaceRole;
  logoUrl: string | null;
}

interface AppContextValue {
  user: AppUser;
  workspace: AppWorkspace;
  memberships: AppMembership[];
  can: (minimum: WorkspaceRole) => boolean;
}

const AppContext = React.createContext<AppContextValue | null>(null);

export function AppProviders({
  user,
  workspace,
  memberships,
  children,
}: {
  user: AppUser;
  workspace: AppWorkspace;
  memberships: AppMembership[];
  children: React.ReactNode;
}) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
          mutations: { retry: 0 },
        },
      }),
  );

  const value = React.useMemo<AppContextValue>(
    () => ({ user, workspace, memberships, can: (minimum) => hasMinRole(workspace.role, minimum) }),
    [user, workspace, memberships],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}

export function useApp(): AppContextValue {
  const ctx = React.useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProviders>');
  return ctx;
}
