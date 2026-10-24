import type { Metadata } from 'next';
import Link from 'next/link';
import { WorkspaceWizard } from '@/components/app/workspace-wizard';
import { requireSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Create your workspace', robots: { index: false } };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ plan?: string }> }) {
  const session = await requireSession('/onboarding');
  const { plan } = await searchParams;
  const firstName = session.profile?.full_name?.split(' ')[0];

  return (
    <div>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold tracking-tight">
          {firstName ? `Welcome, ${firstName}!` : 'Welcome to Talkzi!'} Let’s set up your workspace
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">A workspace holds your WhatsApp numbers, team and customers.</p>
      </div>
      <WorkspaceWizard plan={plan} />
      {session.memberships.length > 0 ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          <Link href="/app" className="hover:text-foreground hover:underline">
            ← Back to {session.workspace?.name ?? 'dashboard'}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
