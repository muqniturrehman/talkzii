import { acceptInvitationSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { verifyInvitationToken } from '@/lib/invitations';
import { RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Accepts an invitation: the HMAC signature proves the link is genuine; the
 * SQL function re-checks token hash, expiry, revocation and the email match.
 */
export const POST = createHandler(
  { auth: 'user', body: acceptInvitationSchema, rateLimit: RATE_LIMITS.auth },
  async ({ body, supabase, user, req }) => {
    const verified = verifyInvitationToken(body.token);
    if (!verified.ok) {
      throw ApiError.badRequest(verified.reason === 'expired' ? 'This invitation has expired.' : 'This invitation link is invalid.');
    }

    const workspaceId = unwrap(
      await supabase.rpc('accept_workspace_invitation', {
        p_invitation_id: verified.payload.iid,
        p_token_hash: verified.tokenHash,
      }),
    );
    await supabase.auth.refreshSession();
    await audit({ workspaceId, actorId: user.id, action: 'invitation.accepted', targetType: 'invitation', targetId: verified.payload.iid, req });
    return { workspaceId };
  },
);
