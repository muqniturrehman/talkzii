import { NextRequest } from 'next/server';
import { describe, expect, it, vi } from 'vitest';
import { computeWebhookSignature } from '@talkzi/whatsapp';
import { logger } from '@/lib/logger';
import { processMetaWebhookPayload, templateStatusFromEvent } from '@/lib/webhooks/meta/processor';
import { receiveMetaWebhook } from '@/lib/webhooks/meta/receive';
import type { InboundContext } from '@/lib/webhooks/meta/types';
import { createMemoryWebhookStore } from './helpers/memory-webhook-store';

const runModule = vi.hoisted(() => ({
  persistMetaEvent: vi.fn(async () => 'evt-1'),
  runMetaEvent: vi.fn(async () => undefined),
}));
vi.mock('@/lib/webhooks/meta/run', () => runModule);
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return { ...actual, after: (task: unknown) => (typeof task === 'function' ? (task as () => unknown)() : task) };
});

const SECRET = process.env.META_APP_SECRET as string;
const log = logger.child({ test: true });

const envelope = (field: string, value: unknown) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA1', changes: [{ field, value }] }],
});
const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '923000000000', phone_number_id: 'PN1' } };
const textMessage = (wamid: string, body = 'Assalam o Alaikum') =>
  envelope('messages', {
    ...meta,
    contacts: [{ profile: { name: 'Ayesha' }, wa_id: '923335550001' }],
    messages: [{ from: '923335550001', id: wamid, timestamp: '1760000000', type: 'text', text: { body } }],
  });

describe('receiveMetaWebhook (signature gate)', () => {
  const deps = () => ({ appSecret: SECRET, persist: vi.fn(async () => 'evt-42'), schedule: vi.fn() });

  it('accepts a correctly signed payload, persists it and schedules processing', async () => {
    const d = deps();
    const raw = JSON.stringify(textMessage('wamid.1'));
    const result = await receiveMetaWebhook(raw, computeWebhookSignature(raw, SECRET), d);
    expect(result).toEqual({ status: 200, body: 'EVENT_RECEIVED', eventId: 'evt-42' });
    expect(d.persist).toHaveBeenCalledWith(JSON.parse(raw), 'messages');
    expect(d.schedule).toHaveBeenCalledWith('evt-42', JSON.parse(raw));
  });

  it('rejects bad signatures without touching storage', async () => {
    const d = deps();
    const raw = JSON.stringify(textMessage('wamid.1'));
    const forged = computeWebhookSignature(raw, 'attacker-secret');
    expect(await receiveMetaWebhook(raw, forged, d)).toMatchObject({ status: 401 });
    expect(await receiveMetaWebhook(raw, null, d)).toMatchObject({ status: 401 });
    expect(d.persist).not.toHaveBeenCalled();
  });

  it('refuses to run unverified when the app secret is missing', async () => {
    const raw = '{}';
    expect(await receiveMetaWebhook(raw, 'sha256=00', { ...deps(), appSecret: undefined })).toMatchObject({ status: 503 });
  });

  it('handles malformed JSON and non-WhatsApp objects', async () => {
    const d = deps();
    const bad = '{not json';
    expect(await receiveMetaWebhook(bad, computeWebhookSignature(bad, SECRET), d)).toMatchObject({ status: 400 });
    const page = JSON.stringify({ object: 'page', entry: [] });
    expect(await receiveMetaWebhook(page, computeWebhookSignature(page, SECRET), d)).toMatchObject({ status: 200, body: 'IGNORED' });
    expect(d.persist).not.toHaveBeenCalled();
  });
});

describe('processMetaWebhookPayload', () => {
  it('records an inbound message once and runs hooks only for new messages', async () => {
    const { store, conversations, recorded } = createMemoryWebhookStore();
    const onInboundMessage = vi.fn(async (_ctx: InboundContext) => undefined);

    const first = await processMetaWebhookPayload(textMessage('wamid.A'), { store, hooks: { onInboundMessage }, log });
    const replay = await processMetaWebhookPayload(textMessage('wamid.A'), { store, hooks: { onInboundMessage }, log });

    expect(first).toMatchObject({ events: 1, messages: 1, duplicates: 0 });
    expect(replay).toMatchObject({ messages: 0, duplicates: 1 });
    expect(onInboundMessage).toHaveBeenCalledTimes(1);
    expect(onInboundMessage.mock.calls[0]![0]).toMatchObject({
      workspaceId: 'ws-1',
      conversationId: 'conv-923335550001',
      contactWaId: '923335550001',
      profileName: 'Ayesha',
      message: { type: 'text', text: 'Assalam o Alaikum' },
    });
    expect(recorded[0]).toMatchObject({ type: 'text', body: 'Assalam o Alaikum', profileName: 'Ayesha' });
    expect(conversations.get('conv-923335550001')).toMatchObject({ unread: 1 });
    expect(conversations.get('conv-923335550001')!.expiresAt!.toISOString()).toBe('2025-10-10T08:53:20.000Z');
  });

  it('stores media previews and reply context', async () => {
    const { store, recorded } = createMemoryWebhookStore();
    await processMetaWebhookPayload(
      envelope('messages', {
        ...meta,
        contacts: [{ wa_id: '923335550001' }],
        messages: [
          {
            from: '923335550001',
            id: 'wamid.IMG',
            timestamp: '1760000000',
            type: 'image',
            image: { id: 'MEDIA1', mime_type: 'image/jpeg' },
            context: { id: 'wamid.QUOTED' },
          },
        ],
      }),
      { store, log },
    );
    expect(recorded[0]).toMatchObject({ type: 'image', body: '📷 Photo', media: { id: 'MEDIA1' }, replyToWamid: 'wamid.QUOTED' });
  });

  it('applies statuses and closes the 24h window on error 131047', async () => {
    const { store, conversations } = createMemoryWebhookStore();
    store.seedOutbound('wamid.OUT', 'conv-x');
    const failedAt = '1760000500';
    const summary = await processMetaWebhookPayload(
      envelope('messages', {
        ...meta,
        statuses: [
          { id: 'wamid.OUT', status: 'failed', timestamp: failedAt, recipient_id: '923335550001', errors: [{ code: 131047, title: 'Re-engagement message' }] },
        ],
      }),
      { store, log },
    );
    expect(summary.statuses).toBe(1);
    expect(store.applyMessageStatus).toHaveBeenCalledWith(
      expect.objectContaining({ wamid: 'wamid.OUT', status: 'failed', errorCode: 131047 }),
    );
    expect(store.closeSessionWindow).toHaveBeenCalledWith('conv-x', new Date(Number(failedAt) * 1000));
    expect(conversations.get('conv-x')!.expiresAt!.getTime()).toBe(Number(failedAt) * 1000);
  });

  it('routes template, phone quality and account events', async () => {
    const { store } = createMemoryWebhookStore();
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA1',
          changes: [
            { field: 'message_template_status_update', value: { event: 'APPROVED', message_template_id: 77, message_template_name: 'promo', message_template_language: 'en', reason: 'NONE' } },
            { field: 'phone_number_quality_update', value: { display_phone_number: '923000000000', event: 'FLAGGED', current_limit: 'TIER_1K' } },
            { field: 'account_review_update', value: { decision: 'APPROVED' } },
            { field: 'account_update', value: { event: 'ACCOUNT_VIOLATION', violation_info: { violation_type: 'SPAM' } } },
          ],
        },
      ],
    };
    const onTemplateStatus = vi.fn(async () => undefined);
    const summary = await processMetaWebhookPayload(payload, { store, hooks: { onTemplateStatus }, log });

    expect(summary.other).toBe(4);
    expect(store.updateTemplateStatus).toHaveBeenCalledWith(expect.objectContaining({ metaTemplateId: '77', event: 'APPROVED', reason: null }));
    expect(onTemplateStatus).toHaveBeenCalledWith({ workspaceId: 'ws-1', templateId: 'tpl-row-1', status: 'APPROVED', reason: null });
    expect(store.pauseBroadcastsForPhone).toHaveBeenCalledWith('phone-row-1', expect.stringContaining('FLAGGED'));
    expect(store.updateWabaReview).toHaveBeenCalledWith({ wabaId: 'WABA1', decision: 'APPROVED' });
    expect(store.recordWabaEvent).toHaveBeenCalledWith(expect.objectContaining({ key: 'last_account_update', status: 'error' }));
  });

  it('ignores unknown phone numbers and isolates hook failures', async () => {
    const { store } = createMemoryWebhookStore(['OTHER']);
    const unknown = await processMetaWebhookPayload(textMessage('wamid.U'), { store, log });
    expect(unknown).toMatchObject({ unknownPhone: 1, messages: 0 });

    const healthy = createMemoryWebhookStore();
    const failing = vi.fn(async () => {
      throw new Error('bot crashed');
    });
    const summary = await processMetaWebhookPayload(textMessage('wamid.H'), { store: healthy.store, hooks: { onInboundMessage: failing }, log });
    expect(summary).toMatchObject({ messages: 1, hookErrors: 1 });
  });

  it('maps template events to stored statuses', () => {
    expect(templateStatusFromEvent('REINSTATED')).toBe('APPROVED');
    expect(templateStatusFromEvent('rejected')).toBe('REJECTED');
    expect(templateStatusFromEvent('FLAGGED')).toBeNull();
  });
});

describe('/api/webhooks/meta route', async () => {
  const { GET, POST } = await import('@/app/api/webhooks/meta/route');

  it('answers the verification handshake', async () => {
    const ok = await GET(new NextRequest('http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=8675309'));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe('8675309');
    const bad = await GET(new NextRequest('http://localhost/api/webhooks/meta?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1'));
    expect(bad.status).toBe(403);
  });

  it('verifies X-Hub-Signature-256 before persisting', async () => {
    const raw = JSON.stringify(textMessage('wamid.R'));
    const rejected = await POST(new NextRequest('http://localhost/api/webhooks/meta', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': 'sha256=' + '0'.repeat(64) } }));
    expect(rejected.status).toBe(401);
    expect(runModule.persistMetaEvent).not.toHaveBeenCalled();

    const accepted = await POST(
      new NextRequest('http://localhost/api/webhooks/meta', { method: 'POST', body: raw, headers: { 'x-hub-signature-256': computeWebhookSignature(raw, SECRET) } }),
    );
    expect(accepted.status).toBe(200);
    expect(runModule.persistMetaEvent).toHaveBeenCalledTimes(1);
    expect(runModule.runMetaEvent).toHaveBeenCalledWith('evt-1', JSON.parse(raw));
  });
});
