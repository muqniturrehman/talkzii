import { createInvitationSchema, PLANS, ROLE_META } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { invitationEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { INVITATION_TTL_DAYS, signInvitationToken } from '@/lib/invitations';
import { sha256Hex } from '@/lib/crypto';

export const GET = createHandler({ role: 'admin' }, async ({ supabase, workspace }) => {
  return unwrap(
    await supabase
      .from('workspace_invitations')
      .select('id, email, role, expires_at, created_at, invited_by')
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false }),
  );
});

export const POST = createHandler(
  { role: 'admin', body: createInvitationSchema },
  async ({ body, supabase, workspace, user, req }) => {
    const [members, pending, existing] = await Promise.all([
      supabase.from('workspace_members').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace.id),
      supabase
        .from('workspace_invitations')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .is('accepted_at', null)
        .is('revoked_at', null),
      supabase
        .from('workspace_members')
        .select('user_id, profile:profiles!workspace_members_user_id_fkey(email)')
        .eq('workspace_id', workspace.id),
    ]);

    const seats = PLANS[workspace.plan].limits.seats;
    if ((members.count ?? 0) + (pending.count ?? 0) >= seats) {
      throw new ApiError(403, 'PLAN_LIMIT', `Your plan includes ${seats} seats. Upgrade to invite more teammates.`, {
        limit: 'seats',
      });
    }
    if ((existing.data ?? []).some((m) => m.profile?.email?.toLowerCase() === body.email)) {
      throw ApiError.conflict('That person is already a member of this workspace.');
    }

    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
    const token = signInvitationToken({ v: 1, iid: id, wid: workspace.id, exp: Math.floor(expiresAt.getTime() / 1000) });

    const invitation = unwrap(
      await supabase
        .from('workspace_invitations')
        .insert({
          id,
          workspace_id: workspace.id,
          email: body.email,
          role: body.role,
          invited_by: user.id,
          token_hash: sha256Hex(token),
          expires_at: expiresAt.toISOString(),
        })
        .select('id, email, role, expires_at, created_at')
        .single(),
    );

    const inviteUrl = `${appUrl()}/invite/${token}`;
    const { data: inviter } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();
    const email = invitationEmail({
      workspaceName: workspace.name,
      inviterName: inviter?.full_name || inviter?.email || 'A teammate',
      role: ROLE_META[body.role].label,
      url: inviteUrl,
    });
    const delivery = await sendEmail({ to: body.email, ...email }).catch(() => ({ delivered: false }));

    await audit({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'invitation.created',
      targetType: 'invitation',
      targetId: id,
      metadata: { email: body.email, role: body.role },
      req,
    });

    // The link is returned so admins can share it when email isn't configured.
    return { invitation, inviteUrl, emailDelivered: delivery.delivered };
  },
);
