import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { incomingActionSchema, isSignedProvider, orderNotificationSchema, planHasFeature, publicContactUpsertSchema, publicSendMessageSchema } from '@talkzi/shared';
import { ApiError, errorResponse } from '@/lib/api/errors';
import { decryptSecret, safeEqual } from '@/lib/crypto';
import { logger } from '@/lib/logger';
import { verifySignature } from '@/lib/outbound/signature';
import { notificationMessage, verifySignedEvent } from '@/lib/public-api/integrations';
import { sendPublicMessage, upsertContactByPhone } from '@/lib/public-api/service';
import { rateLimit, rateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw ApiError.validation(z.flattenError(result.error));
  return result.data;
}

/**
 * Incoming webhooks from connected apps:
 *  - Zapier / n8n / Google Sheets / custom: token (X-Talkzi-Token header or
 *    ?token=) or an X-Talkzi-Signature HMAC; body { action: 'send_message' | 'upsert_contact', … }
 *  - Shopify / WooCommerce / Stripe: the provider's own signature; mapped
 *    topics send an approved template.
 */
export async function POST(req: NextRequest, segment: { params: Promise<{ integrationId: string }> }) {
  const { integrationId } = await segment.params;
  const log = logger.child({ incoming: integrationId });
  let headers: Record<string, string> = {};
  try {
    if (!UUID_RE.test(integrationId)) throw ApiError.notFound('Unknown integration.');
    const limit = await rateLimit({ ...RATE_LIMITS.publicApi, prefix: 'incoming', limit: 120 }, integrationId);
    headers = rateLimitHeaders(limit);
    if (!limit.success) throw ApiError.rateLimited(Math.ceil((limit.reset - Date.now()) / 1000));

    const admin = createSupabaseAdminClient();
    const { data: integration } = await admin
      .from('integrations')
      .select('id, workspace_id, provider, status, config, incoming_secret_encrypted, workspace:workspaces(id, plan)')
      .eq('id', integrationId)
      .maybeSingle();
    if (!integration || integration.status !== 'connected' || !integration.workspace) throw ApiError.notFound('Unknown or disconnected integration.');
    if (!planHasFeature(integration.workspace.plan, 'integrations')) throw ApiError.forbidden('Integrations are part of the Pro and Agency plans.');

    const raw = await req.text();
    const workspace = integration.workspace;
    let result: unknown;

    if (isSignedProvider(integration.provider)) {
      // WooCommerce pings new webhooks with a form body and no signature.
      if (integration.provider === 'woocommerce' && !req.headers.get('x-wc-webhook-signature') && raw.startsWith('webhook_id=')) {
        return NextResponse.json({ data: { ok: true } });
      }
      if (!integration.incoming_secret_encrypted) throw ApiError.unauthorized('Add the webhook signing secret in Talkzi → Integrations → Apps first.');
      const { topic, payload } = verifySignedEvent(integration.provider, raw, req.headers, decryptSecret(integration.incoming_secret_encrypted));
      const notifications = z.array(orderNotificationSchema).catch([]).parse((integration.config as { notifications?: unknown })?.notifications);
      const notification = notifications.find((n) => n.topic === topic);
      if (!notification) {
        result = { ok: true, ignored: `No message configured for “${topic || 'unknown'}”.` };
      } else {
        const message = notificationMessage(notification, payload);
        result = message ? await sendPublicMessage(admin, workspace, parse(publicSendMessageSchema, message), log) : { ok: true, ignored: 'No phone number in the payload.' };
      }
    } else {
      if (!integration.incoming_secret_encrypted) throw ApiError.notFound('Unknown or disconnected integration.');
      const secret = decryptSecret(integration.incoming_secret_encrypted);
      const token = req.headers.get('x-talkzi-token') ?? req.nextUrl.searchParams.get('token') ?? '';
      const signature = req.headers.get('x-talkzi-signature');
      const authorised = (token && safeEqual(token, secret)) || (signature && verifySignature(signature, raw, secret));
      if (!authorised) throw ApiError.unauthorized('Missing or invalid integration token.');

      let json: unknown;
      try {
        json = JSON.parse(raw || '{}');
      } catch {
        throw ApiError.badRequest('Request body must be valid JSON.');
      }
      const { action } = parse(incomingActionSchema, json);
      if (action === 'send_message') {
        result = await sendPublicMessage(admin, workspace, parse(publicSendMessageSchema, json), log);
      } else {
        const { contact, created } = await upsertContactByPhone(admin, workspace, parse(publicContactUpsertSchema, json), { source: 'integration', log });
        result = { contact_id: contact.id, created };
      }
    }

    await admin.from('integrations').update({ last_event_at: new Date().toISOString() }).eq('id', integration.id);
    return NextResponse.json({ data: result }, { headers });
  } catch (error) {
    const response = errorResponse(error, log);
    Object.entries(headers).forEach(([k, v]) => response.headers.set(k, v));
    return response;
  }
}
