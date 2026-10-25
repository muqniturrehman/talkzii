import { z } from 'zod';
import { isSignedProvider, orderNotificationSchema } from '@talkzi/shared';
import type { Json, TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { encryptSecret, randomToken } from '@/lib/crypto';
import { appUrl } from '@/lib/env';
import { INTEGRATION_COLUMNS, toIntegrationResponse } from '@/lib/public-api/integration-rows';

/**
 * Renames, connects/disconnects, edits event → template mappings, replaces
 * the provider signing secret, or rotates the token of a generic integration
 * (the new token is returned once).
 */
export const PATCH = createHandler(
  {
    role: 'admin',
    body: z
      .object({
        name: z.string().trim().min(1).max(80).optional(),
        status: z.enum(['connected', 'disconnected']).optional(),
        notifications: z.array(orderNotificationSchema).max(10).optional(),
        signingSecret: z.string().trim().min(8).max(500).optional(),
        rotateToken: z.literal(true).optional(),
      })
      .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' }),
  },
  async ({ supabase, params, body, workspace, user, req }) => {
    const id = requireUuid(params.id, 'Integration');
    const current = unwrap(await supabase.from('integrations').select('id, provider').eq('id', id).maybeSingle());
    if (!current) throw ApiError.notFound('Integration not found.');
    const signed = isSignedProvider(current.provider);
    if (body.signingSecret && !signed) throw ApiError.badRequest('Only Shopify, WooCommerce and Stripe connections use a signing secret.');
    if (body.rotateToken && signed) throw ApiError.badRequest('This connection is verified with the provider’s signing secret, not a token.');

    const token = body.rotateToken ? `tzin_${randomToken(24)}` : null;
    const secret = body.signingSecret ?? token;
    const patch: TablesUpdate<'integrations'> = {
      ...(body.name ? { name: body.name } : {}),
      ...(body.status ? { status: body.status } : {}),
      ...(body.notifications ? { config: { notifications: body.notifications } as unknown as Json } : {}),
      ...(secret ? { incoming_secret_encrypted: encryptSecret(secret) } : {}),
    };
    const row = unwrap(await supabase.from('integrations').update(patch).eq('id', id).select(INTEGRATION_COLUMNS).maybeSingle());
    if (!row) throw ApiError.notFound('Integration not found.');
    if (secret) {
      await audit({ workspaceId: workspace.id, actorId: user.id, action: 'integration.secret_changed', targetType: 'integration', targetId: id, req });
    }
    return { ...toIntegrationResponse(row, appUrl()), token };
  },
);

export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Integration');
  const rows = unwrap(await supabase.from('integrations').delete().eq('id', id).select('id, provider'));
  if (rows.length === 0) throw ApiError.notFound('Integration not found.');
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'integration.removed', targetType: 'integration', targetId: id, req });
  return { id };
});
