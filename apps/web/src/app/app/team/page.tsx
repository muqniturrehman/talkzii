import type { Metadata } from 'next';
import { hasMinRole, PLANS } from '@talkzi/shared';
import { PageHeader } from '@talkzi/ui/page-header';
import { InviteDialog } from '@/components/app/team/invite-dialog';
import { InvitationsTable, MembersTable } from '@/components/app/team/team-tables';
import { requireWorkspace } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Team' };

export default async function TeamPage({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  const { invite } = await searchParams;
  const session = await requireWorkspace('/app/team');
  const isAdmin = hasMinRole(session.workspace.role, 'admin');
  const supabase = await createSupabaseServerClient();

  const [membersRes, invitesRes] = await Promise.all([
    supabase
      .from('workspace_members')
      .select('user_id, role, created_at, profile:profiles!workspace_members_user_id_fkey(full_name, email, avatar_url)')
      .eq('workspace_id', session.workspace.id)
      .order('created_at'),
    isAdmin
      ? supabase
          .from('workspace_invitations')
          .select('id, email, role, expires_at, created_at')
          .eq('workspace_id', session.workspace.id)
          .is('accepted_at', null)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as { id: string; email: string; role: 'owner' | 'admin' | 'agent' | 'viewer'; expires_at: string; created_at: string }[] }),
  ]);

  const members = (membersRes.data ?? []).map((m) => ({
    userId: m.user_id,
    role: m.role,
    joinedAt: m.created_at,
    name: m.profile?.full_name ?? null,
    email: m.profile?.email ?? null,
    avatarUrl: m.profile?.avatar_url ?? null,
  }));
  const invitations = invitesRes.data ?? [];
  const seats = PLANS[session.workspace.plan].limits.seats;

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Team"
        description={`${members.length} member${members.length === 1 ? '' : 's'} · ${invitations.length} pending · ${seats} seats on ${PLANS[session.workspace.plan].name}`}
        actions={isAdmin ? <InviteDialog defaultOpen={invite === '1'} /> : null}
      />
      <MembersTable members={members} currentUserId={session.user.id} currentRole={session.workspace.role} />
      {isAdmin && invitations.length > 0 ? <InvitationsTable invitations={invitations} /> : null}
    </div>
  );
}
