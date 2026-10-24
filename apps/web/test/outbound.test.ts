import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { nextAttemptAt, postSignedEvent, RETRY_DELAYS_MINUTES } from '@/lib/outbound/deliver';
import { signPayload, verifySignature } from '@/lib/outbound/signature';
import { assertPublicUrl, isPrivateAddress } from '@/lib/outbound/url-guard';
import { getPath, notificationMessage, verifyBase64Hmac } from '@/lib/public-api/integrations';
import { decodeCursor, encodeCursor } from '@/lib/public-api/service';
import { generateApiKey } from '@/lib/api-keys';

describe('outbound webhook signatures', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ type: 'message.received', data: { text: 'Salam' } });

  it('signs t.body with HMAC-SHA256 and verifies within tolerance', () => {
    const t = 1_760_000_000;
    const header = signPayload(secret, body, t);
    const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
    expect(header).toBe(`t=${t},v1=${expected}`);
    expect(verifySignature(header, body, secret, 300, t * 1000 + 60_000)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets, stale timestamps and junk headers', () => {
    const t = 1_760_000_000;
    const header = signPayload(secret, body, t);
    const now = t * 1000;
    expect(verifySignature(header, `${body} `, secret, 300, now)).toBe(false);
    expect(verifySignature(header, body, 'whsec_other', 300, now)).toBe(false);
    expect(verifySignature(header, body, secret, 300, now + 301_000)).toBe(false);
    expect(verifySignature('t=abc,v1=00', body, secret, 300, now)).toBe(false);
    expect(verifySignature('garbage', body, secret, 300, now)).toBe(false);
  });

  it('POSTs signed events with event and delivery headers, never following redirects', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const result = await postSignedEvent({ url: 'https://hooks.example.com/t', secret, event: 'message.received', deliveryId: 'd1', body }, fetchImpl as typeof fetch);
    expect(result).toMatchObject({ ok: true, status: 200, body: 'ok', error: null });
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    const headers = init.headers as Record<string, string>;
    expect(init.redirect).toBe('manual');
    expect(headers['x-talkzi-event']).toBe('message.received');
    expect(headers['x-talkzi-delivery']).toBe('d1');
    expect(verifySignature(headers['x-talkzi-signature']!, body, secret)).toBe(true);
  });

  it('treats non-2xx and network errors as failures without throwing', async () => {
    const redirect = await postSignedEvent({ url: 'https://x.example', secret, event: 'ping', deliveryId: 'd', body }, (async () => new Response(null, { status: 302 })) as typeof fetch);
    expect(redirect.ok).toBe(false);
    const down = await postSignedEvent({ url: 'https://x.example', secret, event: 'ping', deliveryId: 'd', body }, (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch);
    expect(down).toMatchObject({ ok: false, status: null, error: 'ECONNREFUSED' });
  });

  it('backs off on the retry schedule and stops after the last step', () => {
    const now = new Date('2026-10-24T00:00:00Z');
    expect(nextAttemptAt(1, now)?.toISOString()).toBe('2026-10-24T00:01:00.000Z');
    expect(nextAttemptAt(4, now)?.toISOString()).toBe('2026-10-24T01:00:00.000Z');
    expect(nextAttemptAt(RETRY_DELAYS_MINUTES.length + 1, now)).toBeNull();
  });
});

describe('SSRF guard', () => {
  it('classifies private, loopback, link-local and mapped addresses', () => {
    for (const ip of ['10.0.0.1', '127.0.0.1', '169.254.169.254', '172.20.1.1', '192.168.1.1', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a9fe:a9fe']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '2606:4700:4700::1111', '::ffff:808:808']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });

  it('requires https, no credentials and a public address', async () => {
    await expect(assertPublicUrl('http://example.com/hook')).rejects.toThrow(/https/);
    await expect(assertPublicUrl('https://user:pass@8.8.8.8/hook')).rejects.toThrow(/credentials/);
    await expect(assertPublicUrl('https://169.254.169.254/latest/meta-data')).rejects.toThrow(/public/);
    await expect(assertPublicUrl('https://[::ffff:127.0.0.1]/hook')).rejects.toThrow(/public/);
    await expect(assertPublicUrl('https://8.8.8.8/hook')).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('http://localhost:3000/hook', { allowLocalhost: true })).resolves.toBeInstanceOf(URL);
    await expect(assertPublicUrl('http://localhost:3000/hook')).rejects.toThrow(/https/);
  });
});

describe('public API helpers', () => {
  it('generates tk_live_ keys whose stored hash is SHA-256 of the key', async () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(/^tk_live_[0-9A-Za-z]{32}$/);
    expect(key.startsWith(prefix)).toBe(true);
    const { createHash } = await import('node:crypto');
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
  });

  it('round-trips cursors and rejects tampered ones', () => {
    const row = { created_at: '2026-10-24T10:00:00.000Z', id: '6f1c3c1e-8a3b-4b8e-9c55-1d2f3a4b5c6d' };
    expect(decodeCursor(encodeCursor(row))).toEqual({ createdAt: row.created_at, id: row.id });
    expect(decodeCursor(undefined)).toBeNull();
    expect(() => decodeCursor(Buffer.from('nope|x').toString('base64url'))).toThrow(/cursor/i);
  });

  it('maps store payloads to template messages by dot path', () => {
    const order = { name: '#1042', customer: { first_name: 'Ayesha' }, shipping_address: { phone: '0300 1234567' }, line_items: [{ title: 'Kurta' }] };
    expect(getPath(order, 'line_items.0.title')).toBe('Kurta');
    expect(getPath(order, 'customer')).toBeNull();
    expect(
      notificationMessage({ topic: 'orders/create', templateName: 'order_confirmed', language: 'en', variables: ['customer.first_name', 'name', 'missing.path'], phonePath: 'shipping_address.phone' }, order),
    ).toEqual({ to: '0300 1234567', type: 'template', template: { name: 'order_confirmed', language: 'en', variables: ['Ayesha', '#1042', '-'] } });
    expect(notificationMessage({ topic: 'orders/create', templateName: 't', language: 'en', variables: [], phonePath: 'billing.phone' }, order)).toBeNull();
  });

  it('verifies Shopify/WooCommerce base64 HMAC signatures', () => {
    const raw = '{"id":1}';
    const sig = createHmac('sha256', 'shpss_secret').update(raw, 'utf8').digest('base64');
    expect(verifyBase64Hmac(raw, sig, 'shpss_secret')).toBe(true);
    expect(verifyBase64Hmac(raw, sig, 'other')).toBe(false);
    expect(verifyBase64Hmac(raw, null, 'shpss_secret')).toBe(false);
  });
});
