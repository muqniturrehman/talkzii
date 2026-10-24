import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  debugToken,
  exchangeCodeForToken,
  WhatsAppApiError,
  WhatsAppClient,
  wabaIdsFromDebugToken,
} from '../src';
import { fakeSleep, graphError, jsonResponse, mockFetch, sendOk } from './helpers';

const PHONE_ID = '109876543210';
const TOKEN = 'EAAG_test_token';

function client(fetchImpl: typeof fetch, extra: Partial<ConstructorParameters<typeof WhatsAppClient>[0]> = {}) {
  const { sleep, delays } = fakeSleep();
  return {
    wa: new WhatsAppClient({ accessToken: TOKEN, fetch: fetchImpl, sleep, retry: { jitter: false }, ...extra }),
    delays,
  };
}

describe('WhatsAppClient messaging', () => {
  it('sends a text message to /v21.0/{phone_number_id}/messages', async () => {
    const { fetch, calls } = mockFetch(sendOk('wamid.ABC'));
    const { wa } = client(fetch);
    const result = await wa.sendText(PHONE_ID, '+92 300 1234567', 'Assalam o Alaikum!', { replyTo: 'wamid.PREV' });

    expect(result.wamid).toBe('wamid.ABC');
    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call!.method).toBe('POST');
    expect(call!.url.toString()).toBe(`https://graph.facebook.com/v21.0/${PHONE_ID}/messages`);
    expect(call!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(call!.json).toEqual({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: '923001234567',
      context: { message_id: 'wamid.PREV' },
      type: 'text',
      text: { body: 'Assalam o Alaikum!', preview_url: false },
    });
  });

  it('adds appsecret_proof when an app secret is configured', async () => {
    const { fetch, calls } = mockFetch(sendOk());
    const { wa } = client(fetch, { appSecret: 'app-secret' });
    await wa.sendText(PHONE_ID, '923001234567', 'hi');
    const proof = createHmac('sha256', 'app-secret').update(TOKEN).digest('hex');
    expect(calls[0]!.url.searchParams.get('appsecret_proof')).toBe(proof);
  });

  it('builds template payloads with language and components', async () => {
    const { fetch, calls } = mockFetch(sendOk());
    const { wa } = client(fetch);
    await wa.sendTemplate(PHONE_ID, '923001234567', {
      name: 'order_update',
      language: 'en',
      components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ayesha' }] }],
    });
    expect(calls[0]!.json).toMatchObject({
      type: 'template',
      template: { name: 'order_update', language: { code: 'en' }, components: [{ type: 'body' }] },
    });
  });

  it('sends media, location, contacts and interactive messages', async () => {
    const { fetch, calls } = mockFetch(sendOk(), sendOk(), sendOk(), sendOk(), sendOk(), sendOk(), sendOk());
    const { wa } = client(fetch);
    await wa.sendImage(PHONE_ID, '923001234567', { id: 'media-1' }, { caption: 'New stock' });
    await wa.sendDocument(PHONE_ID, '923001234567', { link: 'https://x.test/c.pdf' }, { filename: 'catalog.pdf' });
    await wa.sendAudio(PHONE_ID, '923001234567', { id: 'audio-1' });
    await wa.sendLocation(PHONE_ID, '923001234567', { latitude: 31.52, longitude: 74.35, name: 'Store' });
    await wa.sendContacts(PHONE_ID, '923001234567', [{ name: { formatted_name: 'Support' }, phones: [{ phone: '+92300' }] }]);
    await wa.sendInteractiveButtons(PHONE_ID, '923001234567', {
      body: 'Choose',
      buttons: [
        { id: 'yes', title: 'Yes' },
        { id: 'no', title: 'No' },
      ],
    });
    await wa.sendInteractiveCta(PHONE_ID, '923001234567', { body: 'Track', displayText: 'Open', url: 'https://x.test' });

    expect(calls.map((c) => (c.json as { type: string }).type)).toEqual([
      'image',
      'document',
      'audio',
      'location',
      'contacts',
      'interactive',
      'interactive',
    ]);
    expect(calls[0]!.json).toMatchObject({ image: { id: 'media-1', caption: 'New stock' } });
    expect(calls[5]!.json).toMatchObject({
      interactive: { type: 'button', action: { buttons: [{ type: 'reply', reply: { id: 'yes', title: 'Yes' } }, {}] } },
    });
    expect(calls[6]!.json).toMatchObject({ interactive: { type: 'cta_url', action: { name: 'cta_url' } } });
  });

  it('validates interactive limits locally without calling the API', async () => {
    const { fetch, calls } = mockFetch();
    const { wa } = client(fetch);
    await expect(
      wa.sendInteractiveButtons(PHONE_ID, '923001234567', {
        body: 'x',
        buttons: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, title: `B${i}` })),
      }),
    ).rejects.toBeInstanceOf(WhatsAppApiError);
    await expect(
      wa.sendInteractiveList(PHONE_ID, '923001234567', {
        body: 'x',
        buttonText: 'Menu',
        sections: [{ rows: Array.from({ length: 11 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` })) }],
      }),
    ).rejects.toThrow(/1 to 10 rows/);
    await expect(wa.sendText(PHONE_ID, '12', 'hi')).rejects.toThrow(/Invalid WhatsApp number/);
    await expect(wa.sendText(PHONE_ID, '923001234567', '   ')).rejects.toThrow(/empty/);
    expect(calls).toHaveLength(0);
  });

  it('marks messages as read with an optional typing indicator', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, { success: true }));
    const { wa } = client(fetch);
    await wa.markAsRead(PHONE_ID, 'wamid.IN', { typingIndicator: true });
    expect(calls[0]!.json).toEqual({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: 'wamid.IN',
      typing_indicator: { type: 'text' },
    });
  });
});

describe('retries and error normalisation', () => {
  it('retries 5xx with exponential backoff and then succeeds', async () => {
    const { fetch, calls } = mockFetch(graphError(500, 131000), graphError(503, 2), sendOk('wamid.RETRY'));
    const { wa, delays } = client(fetch);
    const result = await wa.sendText(PHONE_ID, '923001234567', 'hello');
    expect(result.wamid).toBe('wamid.RETRY');
    expect(calls).toHaveLength(3);
    expect(delays).toEqual([300, 600]);
  });

  it('honours Retry-After on 429', async () => {
    const { fetch } = mockFetch(
      jsonResponse(429, { error: { message: 'Too many', code: 130429 } }, { 'retry-after': '2' }),
      sendOk(),
    );
    const { wa, delays } = client(fetch);
    await wa.sendText(PHONE_ID, '923001234567', 'hello');
    expect(delays).toEqual([2000]);
  });

  it('gives up after the configured retries', async () => {
    const { fetch, calls } = mockFetch(graphError(500, 1), graphError(500, 1), graphError(500, 1), graphError(500, 1));
    const { wa } = client(fetch);
    const error = await wa.sendText(PHONE_ID, '923001234567', 'x').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(WhatsAppApiError);
    expect((error as WhatsAppApiError).retryable).toBe(true);
    expect(calls).toHaveLength(4);
  });

  it('does not retry 4xx and normalises the Graph error', async () => {
    const { fetch, calls } = mockFetch(
      graphError(400, 100, '(#100) Invalid parameter', { error_subcode: 2494010, error_data: { details: 'to is invalid' } }),
    );
    const { wa } = client(fetch);
    const error = (await wa.sendText(PHONE_ID, '923001234567', 'x').catch((e: unknown) => e)) as WhatsAppApiError;
    expect(calls).toHaveLength(1);
    expect(error).toMatchObject({
      status: 400,
      code: 100,
      subcode: 2494010,
      category: 'invalid_request',
      retryable: false,
      fbtraceId: 'TRACE123',
      details: 'to is invalid',
    });
  });

  it('maps the 24h window error to a policy category with a friendly message', async () => {
    const { fetch } = mockFetch(graphError(400, 131047, 'Re-engagement message'));
    const { wa } = client(fetch);
    const error = (await wa.sendText(PHONE_ID, '923001234567', 'x').catch((e: unknown) => e)) as WhatsAppApiError;
    expect(error.category).toBe('policy');
    expect(error.friendlyMessage).toMatch(/24 hours/);
  });

  it('flags expired tokens as auth errors', async () => {
    const { fetch } = mockFetch(graphError(401, 190, 'Error validating access token'));
    const { wa } = client(fetch);
    const error = (await wa.getWaba('123').catch((e: unknown) => e)) as WhatsAppApiError;
    expect(error).toMatchObject({ category: 'auth', retryable: false, code: 190 });
  });

  it('retries pre-connect network failures but not ambiguous ones for sends', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const ambiguous = Object.assign(new TypeError('fetch failed'), { cause: { code: 'UND_ERR_SOCKET' } });

    const first = mockFetch(refused, sendOk('wamid.NET'));
    const a = client(first.fetch);
    expect((await a.wa.sendText(PHONE_ID, '923001234567', 'x')).wamid).toBe('wamid.NET');
    expect(first.calls).toHaveLength(2);

    const second = mockFetch(ambiguous);
    const b = client(second.fetch);
    const error = (await b.wa.sendText(PHONE_ID, '923001234567', 'x').catch((e: unknown) => e)) as WhatsAppApiError;
    expect(error.category).toBe('network');
    expect(second.calls).toHaveLength(1);
  });

  it('retries idempotent GETs on any network error', async () => {
    const { fetch, calls } = mockFetch(new TypeError('fetch failed'), jsonResponse(200, { id: '1', name: 'WABA' }));
    const { wa } = client(fetch);
    expect((await wa.getWaba('1')).name).toBe('WABA');
    expect(calls).toHaveLength(2);
  });
});

describe('media, templates and phone numbers', () => {
  it('uploads media as multipart form data', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, { id: 'media-99' }));
    const { wa } = client(fetch);
    const result = await wa.uploadMedia(PHONE_ID, new Blob(['png-bytes'], { type: 'image/png' }), { filename: 'a.png' });
    expect(result.id).toBe('media-99');
    expect(calls[0]!.url.pathname).toBe(`/v21.0/${PHONE_ID}/media`);
    const form = calls[0]!.body as FormData;
    expect(form.get('messaging_product')).toBe('whatsapp');
    expect(form.get('type')).toBe('image/png');
    expect(form.get('file')).toBeInstanceOf(Blob);
  });

  it('resolves and downloads media with the bearer token', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { id: 'm1', url: 'https://lookaside.fbsbx.com/whatsapp_business/attachments/?mid=1', mime_type: 'image/jpeg', sha256: 'x', file_size: 3, messaging_product: 'whatsapp' }),
      new Response(new Uint8Array([1, 2, 3]), { status: 200 }),
    );
    const { wa } = client(fetch);
    const info = await wa.getMediaUrl('m1', { phoneNumberId: PHONE_ID });
    const bytes = await wa.downloadMedia(info.url);
    expect(calls[0]!.url.searchParams.get('phone_number_id')).toBe(PHONE_ID);
    expect(calls[1]!.headers.authorization).toBe(`Bearer ${TOKEN}`);
    expect(new Uint8Array(bytes)).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('creates, lists (paginated), inspects and deletes templates', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, { id: 'tpl-1', status: 'PENDING', category: 'UTILITY' }),
      jsonResponse(200, { data: [{ id: '1', name: 'a', language: 'en', status: 'APPROVED', category: 'UTILITY' }], paging: { cursors: { after: 'CUR' }, next: 'https://next' } }),
      jsonResponse(200, { data: [{ id: '2', name: 'b', language: 'en', status: 'REJECTED', category: 'MARKETING' }], paging: { cursors: { after: 'END' } } }),
      jsonResponse(200, { id: 'tpl-1', name: 'order_update', language: 'en', status: 'APPROVED', category: 'UTILITY' }),
      jsonResponse(200, { success: true }),
    );
    const { wa } = client(fetch);
    const created = await wa.createTemplate('WABA1', {
      name: 'order_update',
      language: 'en',
      category: 'UTILITY',
      components: [{ type: 'BODY', text: 'Hi {{1}}, your order is ready.', example: { body_text: [['Ali']] } }],
    });
    const all = await wa.listAllTemplates('WABA1');
    const status = await wa.getTemplateStatus('tpl-1');
    await wa.deleteTemplate('WABA1', { name: 'order_update', hsmId: 'tpl-1' });

    expect(created.status).toBe('PENDING');
    expect(all.map((t) => t.name)).toEqual(['a', 'b']);
    expect(calls[2]!.url.searchParams.get('after')).toBe('CUR');
    expect(status.status).toBe('APPROVED');
    expect(calls[4]!.method).toBe('DELETE');
    expect(calls[4]!.url.searchParams.get('hsm_id')).toBe('tpl-1');
  });

  it('edits a rejected template by id', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, { success: true }));
    const { wa } = client(fetch);
    await wa.editTemplate('tpl-9', { components: [{ type: 'BODY', text: 'Hello {{1}}, thanks for your order.', example: { body_text: [['Ali']] } }] });
    expect(calls[0]!.method).toBe('POST');
    expect(calls[0]!.url.pathname).toMatch(/\/tpl-9$/);
    expect(JSON.parse(calls[0]!.body as string)).toMatchObject({ components: [{ type: 'BODY' }] });
  });

  it('registers numbers, requests and verifies codes', async () => {
    const ok = () => jsonResponse(200, { success: true });
    const { fetch, calls } = mockFetch(ok(), ok(), ok());
    const { wa } = client(fetch);
    await wa.registerPhoneNumber(PHONE_ID, '123456');
    await wa.requestVerificationCode(PHONE_ID, { method: 'VOICE' });
    await wa.verifyPhoneNumber(PHONE_ID, '654321');
    expect(calls[0]!.json).toEqual({ messaging_product: 'whatsapp', pin: '123456' });
    expect(calls[1]!.json).toEqual({ code_method: 'VOICE', language: 'en_US' });
    expect(calls[2]!.url.pathname).toBe(`/v21.0/${PHONE_ID}/verify_code`);
    await expect(wa.registerPhoneNumber(PHONE_ID, '12')).rejects.toThrow(/6 digits/);
  });

  it('reads phone quality and WABA phone numbers', async () => {
    const { fetch } = mockFetch(
      jsonResponse(200, { quality_rating: 'YELLOW', messaging_limit_tier: 'TIER_1K', throughput: { level: 'STANDARD' }, status: 'CONNECTED' }),
      jsonResponse(200, { data: [{ id: 'p1', display_phone_number: '+92 300 0000000', verified_name: 'Demo' }] }),
    );
    const { wa } = client(fetch);
    expect(await wa.getPhoneQuality(PHONE_ID)).toEqual({
      qualityRating: 'YELLOW',
      messagingLimitTier: 'TIER_1K',
      throughputLevel: 'STANDARD',
      status: 'CONNECTED',
      nameStatus: null,
    });
    expect((await wa.listWabaPhoneNumbers('WABA1'))[0]!.verified_name).toBe('Demo');
  });

  it('updates the business profile', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, { success: true }));
    const { wa } = client(fetch);
    await wa.updatePhoneProfile(PHONE_ID, { about: 'Lawn & khaddar', vertical: 'APPAREL' });
    expect(calls[0]!.json).toEqual({ messaging_product: 'whatsapp', about: 'Lawn & khaddar', vertical: 'APPAREL' });
  });
});

describe('Embedded Signup OAuth helpers', () => {
  it('exchanges the code for a business token', async () => {
    const { fetch, calls } = mockFetch(jsonResponse(200, { access_token: 'EAAB-business', token_type: 'bearer' }));
    const token = await exchangeCodeForToken({ appId: 'APP', appSecret: 'SECRET', code: 'CODE', fetch });
    expect(token).toEqual({ accessToken: 'EAAB-business', tokenType: 'bearer', expiresIn: undefined });
    const url = calls[0]!.url;
    expect(url.pathname).toBe('/v21.0/oauth/access_token');
    expect(Object.fromEntries(url.searchParams)).toEqual({ client_id: 'APP', client_secret: 'SECRET', code: 'CODE' });
  });

  it('does not retry a failed code exchange (codes are single-use)', async () => {
    const { fetch, calls } = mockFetch(graphError(500, 1));
    await expect(exchangeCodeForToken({ appId: 'APP', appSecret: 'SECRET', code: 'CODE', fetch })).rejects.toBeInstanceOf(WhatsAppApiError);
    expect(calls).toHaveLength(1);
  });

  it('extracts WABA ids from debug_token granular scopes', async () => {
    const { fetch, calls } = mockFetch(
      jsonResponse(200, {
        data: {
          app_id: 'APP',
          is_valid: true,
          expires_at: 0,
          scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
          granular_scopes: [
            { scope: 'whatsapp_business_management', target_ids: ['WABA1', 'WABA2'] },
            { scope: 'whatsapp_business_messaging', target_ids: ['WABA1'] },
          ],
        },
      }),
    );
    const info = await debugToken({ appId: 'APP', appSecret: 'SECRET', inputToken: 'EAAB', fetch });
    expect(info.isValid).toBe(true);
    expect(info.expiresAt).toBeNull();
    expect(wabaIdsFromDebugToken(info)).toEqual(['WABA1', 'WABA2']);
    expect(calls[0]!.url.searchParams.get('access_token')).toBe('APP|SECRET');
  });
});
