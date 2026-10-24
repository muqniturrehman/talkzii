import { manualConnectSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { createHandler } from '@/lib/api/handler';
import { completeEmbeddedSignup } from '@/lib/meta/embedded-signup';
import { embeddedSignupDeps } from '@/lib/meta/signup-deps';

export const maxDuration = 60;

/**
 * Developer fallback: connect a WABA with your own System User token (useful
 * before your app has Embedded Signup / Tech Provider access). Owners only.
 */
export const POST = createHandler({ role: 'owner', body: manualConnectSchema }, async ({ body, workspace, user, admin, req }) => {
  const result = await completeEmbeddedSignup(
    { workspaceId: workspace.id, userId: user.id, accessToken: body.accessToken, wabaId: body.wabaId, pin: body.pin },
    embeddedSignupDeps(admin()),
  );
  await audit({
    workspaceId: workspace.id,
    actorId: user.id,
    action: 'whatsapp.connected_manually',
    targetType: 'waba',
    targetId: body.wabaId,
    req,
  });
  return result;
});
