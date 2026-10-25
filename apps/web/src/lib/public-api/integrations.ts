import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import Stripe from 'stripe';
import type { OrderNotification, SignedIntegrationProvider } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';

/** Reads "a.b.0.c" from a JSON payload; returns a trimmed string or null. */
export function getPath(payload: unknown, path: string): string | null {
  let value: unknown = payload;
  for (const part of path.split('.')) {
    if (value === null || value === undefined) return null;
    value = Array.isArray(value) ? value[Number(part)] : (value as Record<string, unknown>)[part];
  }
  if (value === null || value === undefined || typeof value === 'object') return null;
  const text = String(value).trim();
  return text || null;
}

function equal(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

/** Shopify (X-Shopify-Hmac-Sha256) and WooCommerce (X-WC-Webhook-Signature): base64 HMAC-SHA256 of the raw body. */
export function verifyBase64Hmac(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  return equal(createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64'), signature.trim());
}

/**
 * Verifies a provider-signed webhook and returns its topic + payload:
 * Shopify / WooCommerce sign the raw body (base64 HMAC, topic in a header);
 * Stripe uses Stripe-Signature and the topic is the event type.
 */
export function verifySignedEvent(provider: SignedIntegrationProvider, raw: string, headers: Headers, secret: string): { topic: string; payload: unknown } {
  if (provider === 'stripe') {
    try {
      const event = Stripe.webhooks.constructEvent(raw, headers.get('stripe-signature') ?? '', secret);
      return { topic: event.type, payload: event };
    } catch {
      throw ApiError.unauthorized('Invalid webhook signature.');
    }
  }
  const signature = provider === 'shopify' ? headers.get('x-shopify-hmac-sha256') : headers.get('x-wc-webhook-signature');
  if (!verifyBase64Hmac(raw, signature, secret)) throw ApiError.unauthorized('Invalid webhook signature.');
  const topic = (provider === 'shopify' ? headers.get('x-shopify-topic') : headers.get('x-wc-webhook-topic')) ?? '';
  try {
    return { topic, payload: JSON.parse(raw || '{}') };
  } catch {
    throw ApiError.badRequest('Request body must be valid JSON.');
  }
}

/** Store / payment event → template message input (or null when it lacks a phone). */
export function notificationMessage(notification: OrderNotification, payload: unknown) {
  const to = getPath(payload, notification.phonePath);
  if (!to) return null;
  return {
    to,
    type: 'template' as const,
    template: {
      name: notification.templateName,
      language: notification.language,
      variables: notification.variables.map((path) => getPath(payload, path) ?? '-'),
    },
  };
}
