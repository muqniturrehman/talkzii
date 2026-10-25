import { exchangeCodeSchema, PLANS } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { completeEmbeddedSignup } from '@/lib/meta/embedded-signup';
import { embeddedSignupDeps } from '@/lib/meta/signup-deps';

export const maxDuration = 60;

/**
 * Embedded Signup callback: exchanges the FB.login auth code for a business
 * token, stores the WABA + numbers and subscribes webhooks.
 */
export const POST = createHandler({ role: 'admin', body: exchangeCodeSchema }, async ({ body, workspace, user, admin, req, log }) => {
  const db = admin();
  const { count } = await db
    .from('phone_numbers')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspace.id);
  const limit = PLANS[workspace.plan].limits.phone_numbers;
  if ((count ?? 0) >= limit) {
    throw new ApiError(403, 'PLAN_LIMIT', `Your plan includes ${limit} WhatsApp number(s). Upgrade to connect more.`, {
      limit: 'phone_numbers',
    });
  }

  const result = await completeEmbeddedSignup(
    {
      workspaceId: workspace.id,
      userId: user.id,
      code: body.code,
      wabaId: body.wabaId,
      phoneNumberId: body.phoneNumberId,
      pin: body.pin,
      fbUserId: body.fbUserId,
    },
    embeddedSignupDeps(db),
  );

  if (result.warnings.length) log.warn({ warnings: result.warnings }, 'embedded signup completed with warnings');
  await audit({
    workspaceId: workspace.id,
    actorId: user.id,
    action: 'whatsapp.connected',
    targetType: 'waba',
    targetId: result.waba.wabaId,
    metadata: { phoneNumbers: result.phoneNumbers.map((p) => p.displayPhoneNumber), registered: result.registered.length },
    req,
  });
  return result;
});
