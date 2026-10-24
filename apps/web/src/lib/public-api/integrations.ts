import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { OrderNotification } from '@talkzi/shared';

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

/** Store order event → template message input (or null when the event isn't mapped / lacks a phone). */
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
