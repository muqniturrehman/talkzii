import type { Metadata } from 'next';
import { parseBranding, planHasFeature } from '@talkzi/shared';
import { Sidebar } from '@/components/app/sidebar';
import { Topbar } from '@/components/app/topbar';
import { AppProviders } from '@/components/providers/app-providers';
import { requireWorkspace } from '@/lib/auth/session';
import { brandingStyle } from '@/lib/branding';

export const metadata: Metadata = {
  title: { default: 'Dashboard', template: '%s · Talkzi' },
  robots: { index: false, follow: false },
};

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireWorkspace('/app');
  const { workspace, profile, user, memberships } = session;

  // White-label theming is an Agency feature (child workspaces inherit it).
  const branding = planHasFeature(workspace.plan, 'white_label') || workspace.parent_workspace_id
    ? parseBranding(workspace.branding)
    : {};
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
