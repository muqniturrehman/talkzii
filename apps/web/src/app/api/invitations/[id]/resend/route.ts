import { ROLE_META } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { sha256Hex } from '@/lib/crypto';
import { invitationEmail, sendEmail } from '@/lib/email';
import { appUrl } from '@/lib/env';
import { INVITATION_TTL_DAYS, signInvitationToken } from '@/lib/invitations';

/** Rotates the token (old links stop working), extends expiry and re-sends. */
export const POST = createHandler({ role: 'admin' }, async ({ params, supabase, workspace, user }) => {
  const id = params.id ?? '';
  const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 86_400_000);
  const token = signInvitationToken({ v: 1, iid: id, wid: workspace.id, exp: Math.floor(expiresAt.getTime() / 1000) });

  const rows = unwrap(
    await supabase
      .from('workspace_invitations')
      .update({ token_hash: sha256Hex(token), expires_at: expiresAt.toISOString() })
      .eq('id', id)
      .eq('workspace_id', workspace.id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .select('email, role'),
  );
  const invitation = rows[0];
  if (!invitation) throw ApiError.notFound('Invitation not found.');

  const inviteUrl = `${appUrl()}/invite/${token}`;
  const { data: inviter } = await supabase.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle();
  const delivery = await sendEmail({
    to: invitation.email,
    ...invitationEmail({
      workspaceName: workspace.name,
      inviterName: inviter?.full_name || inviter?.email || 'A teammate',
      role: ROLE_META[invitation.role].label,
      url: inviteUrl,
    }),
  }).catch(() => ({ delivered: false }));

  return { inviteUrl, emailDelivered: delivery.delivered };
});
