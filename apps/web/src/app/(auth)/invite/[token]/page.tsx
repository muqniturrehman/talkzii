import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert, Users } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { ROLE_META } from '@talkzi/shared';
import { AcceptInvitation, SignOutButton } from '@/components/auth/accept-invitation';
import { AuthCard } from '@/components/auth/auth-card';
import { getSession } from '@/lib/auth/session';
import { verifyInvitationToken } from '@/lib/invitations';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = { title: 'Join a workspace', robots: { index: false } };

interface InvitationPreview {
  email: string;
  role: 'owner' | 'admin' | 'agent' | 'viewer';
  workspaceName: string;
  inviterName: string | null;
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'superseded';
}

async function loadPreview(invitationId: string, tokenHash: string): Promise<InvitationPreview | null> {
  try {
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from('workspace_invitations')
      .select('email, role, token_hash, accepted_at, revoked_at, expires_at, workspace:workspaces(name), inviter:profiles!workspace_invitations_invited_by_fkey(full_name, email)')
      .eq('id', invitationId)
      .maybeSingle();
    if (!data) return null;
    const status: InvitationPreview['status'] = data.accepted_at
      ? 'accepted'
      : data.revoked_at
        ? 'revoked'
        : new Date(data.expires_at) < new Date()
          ? 'expired'
          : data.token_hash !== tokenHash
            ? 'superseded'
            : 'pending';
    return {
      email: data.email,
      role: data.role,
      workspaceName: data.workspace?.name ?? 'a workspace',
      inviterName: data.inviter?.full_name ?? data.inviter?.email ?? null,
      status,
    };
  } catch (error) {
    logger.warn({ err: error }, 'Could not load invitation preview');
    return null;
  }
}

function InvalidInvite({ message }: { message: string }) {
  return (
    <AuthCard title="Invitation unavailable">
      <div className="flex flex-col items-center gap-3 text-center">
        <CircleAlert className="size-10 text-danger" aria-hidden />
        <p className="text-sm text-muted-foreground">{message}</p>
        <Button variant="outline" asChild>
          <Link href="/login">Go to sign in</Link>
        </Button>
      </div>
    </AuthCard>
  );
}

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyInvitationToken(decodeURIComponent(token));
  if (!verified.ok) {
    return (
      <InvalidInvite
        message={verified.reason === 'expired' ? 'This invitation has expired. Ask your admin to send a new one.' : 'This invitation link is invalid.'}
      />
    );
  }

  const [preview, session] = await Promise.all([loadPreview(verified.payload.iid, verified.tokenHash), getSession()]);

  if (preview && preview.status !== 'pending') {
    const messages = {
      accepted: 'This invitation has already been accepted.',
      revoked: 'This invitation was revoked by an admin.',
      expired: 'This invitation has expired. Ask your admin to send a new one.',
      superseded: 'A newer invitation was sent. Please use the most recent email.',
    } as const;
    return <InvalidInvite message={messages[preview.status]} />;
  }

  const invitePath = `/invite/${encodeURIComponent(token)}`;
  const emailMatches = !preview || !session?.user.email || session.user.email.toLowerCase() === preview.email;

  return (
    <AuthCard
      title={preview ? `Join ${preview.workspaceName}` : 'Join your team on Talkzi'}
      description={
        preview?.inviterName ? `${preview.inviterName} invited you to collaborate on WhatsApp.` : 'You have been invited to a workspace.'
      }
    >
      <div className="mb-6 flex flex-col items-center gap-3">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/15 text-primary dark:text-accent">
          <Users className="size-7" aria-hidden />
        </div>
        {preview ? (
          <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
            <span className="text-muted-foreground">Invited as</span>
            <Badge>{ROLE_META[preview.role].label}</Badge>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">{preview.email}</span>
          </div>
        ) : null}
      </div>

      {!session ? (
        <div className="space-y-3">
          <Button className="w-full" asChild>
            <Link href={`/signup?next=${encodeURIComponent(invitePath)}${preview ? `&email=${encodeURIComponent(preview.email)}` : ''}`}>
              Create an account to join
            </Link>
          </Button>
          <Button variant="outline" className="w-full" asChild>
            <Link href={`/login?next=${encodeURIComponent(invitePath)}`}>I already have an account</Link>
          </Button>
        </div>
      ) : emailMatches ? (
        <AcceptInvitation token={decodeURIComponent(token)} />
      ) : (
        <div className="space-y-4 text-center">
          <p className="text-sm text-muted-foreground">
            You’re signed in as <strong className="text-foreground">{session.user.email}</strong>, but this invitation
            was sent to <strong className="text-foreground">{preview?.email}</strong>.
          </p>
          <SignOutButton redirectTo={`/login?next=${encodeURIComponent(invitePath)}`} />
        </div>
      )}
    </AuthCard>
  );
}
