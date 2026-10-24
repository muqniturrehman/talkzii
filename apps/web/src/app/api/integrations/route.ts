import { createIntegrationSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { appUrl } from '@/lib/env';
import { INTEGRATION_COLUMNS, isStoreProvider, toIntegrationResponse } from '@/lib/public-api/integration-rows';

export const GET = createHandler({ role: 'admin' }, async ({ supabase }) => {
  const rows = unwrap(await supabase.from('integrations').select(INTEGRATION_COLUMNS).order('created_at', { ascending: false }));
  return rows.map((r) => toIntegrationResponse(r, appUrl()));
});

/**
 * Connects an integration. Zapier / n8n / custom get a Talkzi-generated token
 * (shown once); Shopify / WooCommerce use the store's webhook signing secret,
 * which can be pasted now or after the store webhook is created.
 */
export const POST = createHandler({ role: 'admin', feature: 'integrations', body: createIntegrationSchema }, async ({ supabase, body, workspace, user, req }) => {
  const store = isStoreProvider(body.provider);
  const token = store ? null : `tzin_${randomToken(24)}`;
  const secret = store ? (body.signingSecret ?? null) : token;
  const { data, error } = await supabase
    .from('integrations')
    .insert({
      workspace_id: workspace.id,
      provider: body.provider,
      name: body.name,
      status: 'connected',
      config: { notifications: body.notifications } as unknown as Json,
      incoming_secret_encrypted: secret ? encryptSecret(secret) : null,
      created_by: user.id,
    })
    .select(INTEGRATION_COLUMNS)
    .single();
  if (error || !data) throw ApiError.forbidden();
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'integration.connected', targetType: 'integration', targetId: data.id, metadata: { provider: body.provider }, req });
  return { ...toIntegrationResponse(data, appUrl()), token };
});
