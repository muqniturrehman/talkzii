import type { Metadata } from 'next';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { AppProviders } from '@/components/providers/app-providers';
import { getSession, requireWorkspace } from '@/lib/auth/session';
import { brandingStyle } from '@/lib/branding';
import { workspaceBranding } from '@/lib/branding-server';

/** Browser tab title and favicon follow the workspace's (or its agency's) brand. */
export async function generateMetadata(): Promise<Metadata> {
  const session = await getSession();
  const branding = session?.workspace ? await workspaceBranding(session.workspace.id) : {};
  return {
    title: { default: 'Dashboard', template: `%s · ${branding.brandName ?? 'Talkzi'}` },
    robots: { index: false, follow: false },
    ...(branding.faviconUrl ? { icons: { icon: branding.faviconUrl } } : {}),
  };
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspace('/app');
  const { workspace, profile, user, memberships } = session;

  // White-label theming is an Agency feature; client workspaces inherit the agency's brand.
  const branding = await workspaceBranding(workspace.id);
  const css = brandingStyle(branding);

  return (
    <AppProviders
      user={{
        id: user.id,
        email: user.email,
        fullName: profile?.full_name ?? null,
        avatarUrl: profile?.avatar_url ?? null,
      }}
      workspace={{
        id: workspace.id,
        name: workspace.name,
        slug: workspace.slug,
        role: workspace.role,
        plan: workspace.plan,
        logoUrl: workspace.logo_url,
        timezone: workspace.timezone,
        defaultCountryCode: workspace.default_country_code,
        branding,
        parentWorkspaceId: workspace.parent_workspace_id,
      }}
      memberships={memberships.map((m) => ({ id: m.id, name: m.name, role: m.role, logoUrl: m.logo_url }))}
    >
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <div className="flex min-h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main id="main" className="flex-1">
            {children}
          </main>
        </div>
      </div>
    </AppProviders>
  );
}
