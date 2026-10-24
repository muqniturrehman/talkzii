import { createWebhookSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { isProduction } from '@/lib/env';
import { assertPublicUrl } from '@/lib/outbound/url-guard';

const WEBHOOK_COLUMNS = 'id, url, description, events, active, failure_count, last_delivery_at, last_status, created_at';

export const GET = createHandler({ role: 'admin' }, async ({ supabase }) =>
  unwrap(await supabase.from('webhooks').select(WEBHOOK_COLUMNS).order('created_at', { ascending: false })),
);

/** Adds an endpoint; the signing secret is returned once. */
export const POST = createHandler({ role: 'admin', feature: 'webhooks', body: createWebhookSchema }, async ({ supabase, body, workspace, user, req }) => {
  try {
    await assertPublicUrl(body.url, { allowLocalhost: !isProduction() });
  } catch (error) {
    throw ApiError.validation({ fieldErrors: { url: [(error as Error).message] } }, (error as Error).message);
  }
  const secret = `whsec_${randomToken(24)}`;
  const { data, error } = await supabase
    .from('webhooks')
    .insert({ workspace_id: workspace.id, url: body.url, description: body.description ?? null, events: body.events, secret_encrypted: encryptSecret(secret), created_by: user.id })
    .select(WEBHOOK_COLUMNS)
    .single();
  if (error || !data) throw ApiError.forbidden();
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'webhook.created', targetType: 'webhook', targetId: data.id, metadata: { events: body.events }, req });
  return { ...data, secret };
});
