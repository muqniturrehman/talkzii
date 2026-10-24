import { describe, expect, it, vi } from 'vitest';
import { WhatsAppClient } from '@talkzi/whatsapp';
import type { TablesInsert } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { completeEmbeddedSignup, type WabaStore } from '@/lib/meta/embedded-signup';

type Handler = (url: URL, init: RequestInit) => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Routes Graph API calls by path, recording them in order. */
function graphMock(routes: Record<string, Handler>) {
  const calls: { method: string; path: string; url: URL; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const method = init.method ?? 'GET';
    const path = url.pathname.replace(/^\/v21\.0\//, '');
    calls.push({ method, path, url, body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined });
    const handler = routes[`${method} ${path}`];
    if (!handler) return json({ error: { message: `unmocked ${method} ${path}`, code: 100 } }, 400);
    return handler(url, init);
  });
  return { fetch: fetchImpl as unknown as typeof fetch, calls };
}

function memoryStore(existingOwner: string | null = null) {
  const wabas: TablesInsert<'waba_accounts'>[] = [];
  const phones: TablesInsert<'phone_numbers'>[] = [];
  const store: WabaStore = {
    findWabaOwner: async () => existingOwner,
    upsertWaba: async (row) => {
      wabas.push(row);
      return { id: 'waba-row-1', wabaId: row.waba_id, name: row.name ?? null };
    },
    upsertPhoneNumbers: async (rows) => {
      phones.push(...rows);
      return rows.map((r, i) => ({
        id: `phone-row-${i}`,
        phoneNumberId: r.phone_number_id,
        displayPhoneNumber: r.display_phone_number,
        verifiedName: r.verified_name ?? null,
        qualityRating: r.quality_rating ?? 'UNKNOWN',
        isRegistered: Boolean(r.is_registered),
      }));
    },
    hasDefaultPhone: async () => false,
  };
  return { store, wabas, phones };
}

const baseRoutes = (overrides: Record<string, Handler> = {}): Record<string, Handler> => ({
  'GET oauth/access_token': () => json({ access_token: 'EAAB-business-token', token_type: 'bearer' }),
  'GET debug_token': () =>
    json({
      data: {
        app_id: 'APP',
        is_valid: true,
        expires_at: 0,
        scopes: ['whatsapp_business_management', 'whatsapp_business_messaging'],
        granular_scopes: [{ scope: 'whatsapp_business_management', target_ids: ['WABA777'] }],
      },
    }),
  'GET WABA777': () => json({ id: 'WABA777', name: 'Lahore Lawn Co', currency: 'USD', account_review_status: 'APPROVED' }),
  'GET WABA777/phone_numbers': () =>
    json({
      data: [
        {
          id: 'PN111',
          display_phone_number: '+92 300 1112223',
          verified_name: 'Lahore Lawn Co',
          quality_rating: 'GREEN',
          messaging_limit_tier: 'TIER_1K',
          code_verification_status: 'VERIFIED',
          status: 'PENDING',
        },
      ],
    }),
  'POST WABA777/subscribed_apps': () => json({ success: true }),
  'POST PN111/register': () => json({ success: true }),
  ...overrides,
});

function deps(fetchImpl: typeof fetch, store: WabaStore) {
  return {
    appId: 'APP',
    appSecret: 'SECRET',
    fetch: fetchImpl,
    store,
    encrypt: encryptSecret,
    createClient: (token: string) =>
      new WhatsAppClient({ accessToken: token, fetch: fetchImpl, retry: { retries: 0 }, sleep: async () => undefined }),
  };
}

describe('completeEmbeddedSignup', () => {
  it('exchanges the code, subscribes webhooks, registers the number and stores an encrypted token', async () => {
    const { fetch, calls } = graphMock(baseRoutes());
    const { store, wabas, phones } = memoryStore();

    const result = await completeEmbeddedSignup(
      { workspaceId: 'ws-1', userId: 'user-1', code: 'AUTH_CODE', wabaId: 'WABA777', phoneNumberId: 'PN111', pin: '246810' },
      deps(fetch, store),
    );

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET oauth/access_token',
      'GET debug_token',
      'GET WABA777',
      'GET WABA777/phone_numbers',
      'POST WABA777/subscribed_apps',
      'POST PN111/register',
    ]);
    expect(calls[0]!.url.searchParams.get('code')).toBe('AUTH_CODE');
    expect(calls[5]!.body).toEqual({ messaging_product: 'whatsapp', pin: '246810' });

    expect(result.registered).toEqual(['PN111']);
    expect(result.warnings).toEqual([]);
    expect(result.phoneNumbers[0]).toMatchObject({ phoneNumberId: 'PN111', isRegistered: true });

    const saved = wabas[0]!;
    expect(saved).toMatchObject({ workspace_id: 'ws-1', waba_id: 'WABA777', name: 'Lahore Lawn Co', status: 'connected', webhook_subscribed: true });
    expect(saved.access_token_encrypted).not.toContain('EAAB');
    expect(decryptSecret(saved.access_token_encrypted!)).toBe('EAAB-business-token');
    expect(phones[0]).toMatchObject({ phone_number_id: 'PN111', is_default: true, status: 'CONNECTED', quality_rating: 'GREEN' });
  });

  it('discovers the WABA from debug_token when the popup did not report it', async () => {
    const { fetch } = graphMock(baseRoutes());
    const { store, wabas } = memoryStore();
    const result = await completeEmbeddedSignup({ workspaceId: 'ws-1', userId: 'u', code: 'AUTH_CODE' }, deps(fetch, store));
    expect(wabas[0]!.waba_id).toBe('WABA777');
    expect(result.registered).toEqual([]);
  });

  it('keeps going with a warning when webhook subscription fails', async () => {
    const { fetch } = graphMock(
      baseRoutes({ 'POST WABA777/subscribed_apps': () => json({ error: { message: 'nope', code: 200 } }, 403) }),
    );
    const { store, wabas } = memoryStore();
    const result = await completeEmbeddedSignup({ workspaceId: 'ws-1', userId: 'u', code: 'AUTH_CODE', wabaId: 'WABA777' }, deps(fetch, store));
    expect(result.warnings[0]).toMatch(/Webhook subscription failed/);
    expect(wabas[0]!.webhook_subscribed).toBe(false);
  });

  it('refuses a WABA that belongs to another workspace', async () => {
    const { fetch } = graphMock(baseRoutes());
    const { store } = memoryStore('another-workspace');
    await expect(
      completeEmbeddedSignup({ workspaceId: 'ws-1', userId: 'u', code: 'AUTH_CODE', wabaId: 'WABA777' }, deps(fetch, store)),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('surfaces an invalid / expired code as a WHATSAPP_ERROR', async () => {
    const { fetch, calls } = graphMock(
      baseRoutes({
        'GET oauth/access_token': () =>
          json({ error: { message: 'This authorization code has expired.', type: 'OAuthException', code: 100 } }, 400),
      }),
    );
    const { store } = memoryStore();
    const error = await completeEmbeddedSignup({ workspaceId: 'ws-1', userId: 'u', code: 'OLD' }, deps(fetch, store)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'WHATSAPP_ERROR', status: 502 });
    expect(calls).toHaveLength(1);
  });
});
