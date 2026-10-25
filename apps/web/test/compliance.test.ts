import { createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from './helpers/memory-db';
import { createFakeSupabase } from './helpers/supabase-mock';

const clients = vi.hoisted(() => ({ server: null as unknown, admin: null as unknown }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn(async () => clients.server) }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => clients.admin }));

import { GET as deletionStatus } from '@/app/api/compliance/deletion-status/route';
import { POST as metaDataDeletion } from '@/app/api/meta/data-deletion/route';
import { deleteWorkspace, eraseContact, newConfirmationCode, parseSignedRequest } from '@/lib/compliance/deletion';
import { handleOptKeywords } from '@/lib/compliance/opt-keywords';
import { runRetention } from '@/lib/compliance/retention';
import { logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import type { InboundContext } from '@/lib/webhooks/meta/types';

const WS = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const log = logger.child({ test: 'compliance' });

/** Memory DB plus a Storage stub: `files[bucket]` maps folder → entries. */
function setup(files: Record<string, Record<string, { name: string; id: string | null }[]>> = {}) {
  const db = createMemoryDb();
  const removed: Record<string, string[]> = {};
  const storage = {
    from: (bucket: string) => ({
      list: vi.fn(async (folder: string) => ({ data: files[bucket]?.[folder] ?? [], error: null })),
      remove: vi.fn(async (paths: string[]) => {
        (removed[bucket] ??= []).push(...paths);
        return { data: paths, error: null };
      }),
    }),
  };
  const admin = Object.assign(db, { storage });
  clients.admin = admin;
  return { db, admin: admin as unknown as TypedSupabaseClient, removed };
}

function inbound(text: string): InboundContext {
  return {
    workspaceId: WS,
    conversationId: 'conv-1',
    contactId: 'contact-1',
    messageId: 'msg-in-1',
    phoneNumberRowId: 'phone-1',
    metaPhoneNumberId: 'PN1',
    contactWaId: '923001234567',
    profileName: 'Ayesha',
    message: { type: 'text', text } as InboundContext['message'],
  };
}

describe('opt-out keywords', () => {
  it('opts contacts out on STOP / BAND KARO, ends bot sessions, confirms, and opts back in on START', async () => {
    const { db, admin } = setup();
    db.table('workspaces').push({ id: WS, settings: {} });
    db.table('contacts').push({ id: 'contact-1', opted_out: false });
    db.table('chatbot_sessions').push({ id: 's1', conversation_id: 'conv-1', status: 'waiting' });
    const send = vi.fn(async () => ({ id: 'm', conversationId: 'conv-1', wamid: 'w', status: 'sent', duplicate: false }));

    expect(await handleOptKeywords(admin, inbound('Band karo!'), log, send)).toBe(true);
    expect(db.table('contacts')[0]).toMatchObject({ opted_out: true, opt_out_reason: 'Replied “BAND KARO”' });
    expect(db.table('chatbot_sessions')[0]).toMatchObject({ status: 'completed' });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'text', clientMessageId: 'opt-msg-in-1', text: expect.stringContaining('unsubscribed') }),
      expect.objectContaining({ senderType: 'system' }),
      expect.anything(),
    );

    expect(await handleOptKeywords(admin, inbound('start'), log, send)).toBe(true);
    expect(db.table('contacts')[0]).toMatchObject({ opted_out: false, opt_out_reason: null });

    expect(await handleOptKeywords(admin, inbound('Please stop by the shop tomorrow'), log, send)).toBe(false);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('uses the workspace’s own keywords and replies', async () => {
    const { db, admin } = setup();
    db.table('workspaces').push({ id: WS, settings: { compliance: { optOutKeywords: ['NAHI CHAHIYE'], optOutReply: 'Theek hai!' } } });
    db.table('contacts').push({ id: 'contact-1', opted_out: false });
    const send = vi.fn(async () => ({ id: 'm', conversationId: 'conv-1', wamid: 'w', status: 'sent', duplicate: false }));
    expect(await handleOptKeywords(admin, inbound('stop'), log, send)).toBe(false);
    expect(await handleOptKeywords(admin, inbound('nahi chahiye'), log, send)).toBe(true);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ text: 'Theek hai!' }), expect.anything(), expect.anything());
  });
});

describe('erasure and deletion', () => {
  it('erases a contact with their media files and records a confirmation code', async () => {
    const { db, admin, removed } = setup();
    db.table('contacts').push({ id: 'contact-1', workspace_id: WS, wa_id: '923001234567' });
    db.table('messages').push(
      { id: 'm1', contact_id: 'contact-1', media: { storagePath: `${WS}/media/a.jpg` } },
      { id: 'm2', contact_id: 'contact-1', media: { storagePath: 'other-workspace/b.jpg' } },
      { id: 'm3', contact_id: 'contact-1', media: null },
    );
    const result = await eraseContact(admin, { workspaceId: WS, contactId: 'contact-1', actorId: 'u1' });
    expect(result.confirmationCode).toMatch(/^DEL-[A-Z2-9]{10}$/);
    expect(removed.media).toEqual([`${WS}/media/a.jpg`]);
    expect(db.table('contacts')).toHaveLength(0);
    expect(db.table('data_deletion_requests')[0]).toMatchObject({ source: 'contact_request', status: 'completed', confirmation_code: result.confirmationCode });
  });

  it('deletes a workspace: cancels its card subscription, removes files in nested folders, then the row', async () => {
    const { db, admin, removed } = setup({
      media: { [WS]: [{ name: 'a.jpg', id: 'f1' }, { name: 'inbox', id: null }], [`${WS}/inbox`]: [{ name: 'b.ogg', id: 'f2' }] },
      branding: { [WS]: [{ name: 'logo.png', id: 'f3' }] },
    });
    db.table('workspaces').push({ id: WS, name: 'Doomed Co' });
    db.table('billing_subscriptions').push({ workspace_id: WS, provider: 'stripe', status: 'active', stripe_subscription_id: 'sub_9' });
    const cancelSubscription = vi.fn(async () => undefined);

    const result = await deleteWorkspace(admin, { workspaceId: WS, requesterId: 'u1', requesterEmail: 'owner@test.dev' }, { cancelSubscription, log });
    expect(cancelSubscription).toHaveBeenCalledWith('sub_9');
    expect(removed.media).toEqual([`${WS}/a.jpg`, `${WS}/inbox/b.ogg`]);
    expect(removed.branding).toEqual([`${WS}/logo.png`]);
    expect(db.table('workspaces')).toHaveLength(0);
    expect(result.files).toBe(3);
    expect(db.table('data_deletion_requests')[0]).toMatchObject({ source: 'user_request', status: 'completed', confirmation_code: result.confirmationCode });
  });

  it('issues distinct, readable confirmation codes', () => {
    const codes = new Set(Array.from({ length: 50 }, newConfirmationCode));
    expect(codes.size).toBe(50);
    for (const code of codes) expect(code).toMatch(/^DEL-[A-HJ-NP-Z2-9]{10}$/);
  });
});

describe('Meta data deletion callback', () => {
  const secret = 'meta-app-secret-for-tests';
  const sign = (payload: object, key = secret) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${createHmac('sha256', key).update(body).digest('base64url')}.${body}`;
  };

  it('verifies signed requests', () => {
    expect(parseSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '1234', issued_at: 1 }), secret)).toEqual({ user_id: '1234', issued_at: 1 });
    expect(parseSignedRequest(sign({ algorithm: 'HMAC-SHA256', user_id: '1234' }, 'wrong'), secret)).toBeNull();
    expect(parseSignedRequest(sign({ algorithm: 'MD5', user_id: '1234' }), secret)).toBeNull();
    expect(parseSignedRequest('garbage', secret)).toBeNull();
  });

  it('revokes the user’s WhatsApp tokens and returns a status URL with a confirmation code', async () => {
    const { db } = setup();
    // The memory DB matches PostgREST's JSON-path filter key literally.
    db.table('waba_accounts').push({ id: 'waba-1', workspace_id: WS, access_token_encrypted: 'enc', status: 'connected', metadata: { fb_user_id: '42' }, 'metadata->>fb_user_id': '42' });
    db.table('phone_numbers').push({ id: 'p1', waba_account_id: 'waba-1', status: 'CONNECTED', is_default: true });

    const body = new URLSearchParams({ signed_request: sign({ algorithm: 'HMAC-SHA256', user_id: '42' }) });
    const res = await metaDataDeletion(new NextRequest('http://localhost/api/meta/data-deletion', { method: 'POST', body }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { url: string; confirmation_code: string };
    expect(json.confirmation_code).toMatch(/^DEL-/);
    expect(json.url).toContain(`/data-deletion?code=${json.confirmation_code}`);
    expect(db.table('waba_accounts')[0]).toMatchObject({ access_token_encrypted: null, status: 'disconnected' });
    expect(db.table('phone_numbers')[0]).toMatchObject({ status: 'DISCONNECTED' });
    expect(db.table('data_deletion_requests')[0]).toMatchObject({ source: 'meta_callback', meta_user_id: '42', status: 'completed' });

    const bad = new URLSearchParams({ signed_request: sign({ algorithm: 'HMAC-SHA256', user_id: '42' }, 'forged') });
    expect((await metaDataDeletion(new NextRequest('http://localhost/api/meta/data-deletion', { method: 'POST', body: bad }))).status).toBe(400);
  });

  it('looks up deletion status by code', async () => {
    const { db } = setup();
    clients.server = createFakeSupabase({});
    db.table('data_deletion_requests').push({ confirmation_code: 'DEL-ABCDEFGH23', status: 'completed', requested_at: '2026-10-01T00:00:00Z', completed_at: '2026-10-02T00:00:00Z' });
    const lookup = (code: string) => deletionStatus(new NextRequest(`http://localhost/api/compliance/deletion-status?code=${code}`), { params: Promise.resolve({}) });

    const found = await lookup('del-abcdefgh23');
    expect(found.status).toBe(200);
    expect(await found.json()).toEqual({ data: { status: 'completed', requestedAt: '2026-10-01T00:00:00Z', completedAt: '2026-10-02T00:00:00Z' } });
    expect((await lookup('DEL-NOTFOUND99')).status).toBe(404);
    expect((await lookup('hello')).status).toBe(422);
  });
});

describe('retention', () => {
  beforeEach(() => vi.useRealTimers());

  it('purges per workspace retention in batches, removes media and clears platform logs', async () => {
    const { db, admin, removed } = setup();
    db.table('workspaces').push({ id: WS, settings: { compliance: { dataRetentionDays: 30 } } }, { id: 'keep-forever', settings: { compliance: { dataRetentionDays: null } } });
    const batch = Array.from({ length: 2000 }, (_, i) => ({ deleted_id: `m${i}`, storage_path: i === 0 ? `${WS}/x.jpg` : i === 1 ? 'foreign/y.jpg' : null }));
    db.rpc.mockImplementation(async (name: string) => {
      if (name === 'purge_workspace_messages') {
        const calls = db.rpc.mock.calls.filter(([n]) => n === 'purge_workspace_messages').length;
        return { data: calls === 1 ? batch : [{ deleted_id: 'last', storage_path: null }], error: null };
      }
      if (name === 'purge_platform_logs') return { data: { webhook_events: 5 }, error: null };
      return { data: null, error: null };
    });

    const totals = await runRetention(admin, log, Date.now() + 10_000);
    expect(totals).toMatchObject({ workspaces: 1, messages: 2001, files: 1, logs: { webhook_events: 5 } });
    expect(removed.media).toEqual([`${WS}/x.jpg`]);
    const purgeCalls = db.rpc.mock.calls.filter(([n]) => n === 'purge_workspace_messages');
    expect(purgeCalls).toHaveLength(2);
    expect(purgeCalls.every(([, args]) => (args as { p_workspace_id: string }).p_workspace_id === WS)).toBe(true);
  });
});
