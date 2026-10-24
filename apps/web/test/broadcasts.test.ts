import { describe, expect, it, vi } from 'vitest';
import { normalizeGraphError, type MessagePayload } from '@talkzi/whatsapp';
import { ApiError } from '@/lib/api/errors';
import { launchBroadcast, type LaunchStore } from '@/lib/broadcasts/launch';
import { processBroadcast, type BroadcastStore, type ProcessContactRow, type RecipientRow } from '@/lib/broadcasts/processor';
import { resolveTemplateValues } from '@/lib/broadcasts/variables';
import { logger } from '@/lib/logger';
import type { WhatsAppApi } from '@/lib/meta/whatsapp';

const WS = 'ws-1';
const TEMPLATE = {
  id: 'tpl-1',
  name: 'eid_sale',
  language: 'en',
  category: 'MARKETING',
  status: 'APPROVED',
  components: [{ type: 'BODY', text: 'Hi {{1}}, enjoy {{2}} off this Eid!', example: { body_text: [['Ali', '20%']] } }],
};
const MAPPING = {
  body: [
    { source: 'contact.first_name', fallback: 'there' },
    { source: 'static', value: '20%' },
  ],
};

function launchStore(overrides: Partial<LaunchStore> = {}): LaunchStore & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { materialize: [], markScheduled: [], recordUsage: [] };
  return {
    calls,
    getBroadcast: async () => ({ id: 'b-1', status: 'draft', template_id: TEMPLATE.id, phone_number_id: 'ph-1', variable_mapping: MAPPING }),
    getTemplate: async () => TEMPLATE,
    getPhone: async () => ({ id: 'ph-1', quality_rating: 'GREEN', status: 'CONNECTED' }),
    recipientsUsedThisMonth: async () => 100,
    materialize: async (...args) => {
      calls.materialize!.push(args);
      return { total: 42, sendable: 40, skipped: 2 };
    },
    markScheduled: async (...args) => {
      calls.markScheduled!.push(args);
    },
    recordUsage: async (...args) => {
      calls.recordUsage!.push(args);
    },
    ...overrides,
  };
}

const NOW = new Date('2026-10-24T10:00:00Z');

describe('broadcast launch (enqueue)', () => {
  it('snapshots the audience within the plan allowance, estimates cost and enqueues it', async () => {
    const store = launchStore();
    const enqueue = vi.fn(async () => undefined);
    const result = await launchBroadcast({ store, queue: { enqueue }, now: () => NOW }, { workspace: { id: WS, plan: 'free' }, broadcastId: 'b-1' });

    expect(store.calls.materialize).toEqual([['b-1', 150]]); // free plan: 250/month − 100 used
    expect(enqueue).toHaveBeenCalledWith('b-1', NOW);
    expect(store.calls.recordUsage).toEqual([[WS, 40]]);
    expect(result).toMatchObject({ status: 'scheduled', recipients: { sendable: 40, skipped: 2 }, scheduledAt: NOW.toISOString() });
    expect(result.estimatedCost).toBeCloseTo(40 * 0.0473, 4);
    expect(store.calls.markScheduled?.[0]).toEqual(['b-1', expect.objectContaining({ phoneNumberId: 'ph-1', templateName: 'eid_sale' })]);
  });

  it('enqueues scheduled broadcasts with a delay using the plan allowance', async () => {
    const store = launchStore();
    const enqueue = vi.fn(async () => undefined);
    const at = '2026-10-25T09:00:00+05:00';
    await launchBroadcast({ store, queue: { enqueue }, now: () => NOW }, { workspace: { id: WS, plan: 'agency' }, broadcastId: 'b-1', scheduledAt: at });
    expect(enqueue).toHaveBeenCalledWith('b-1', new Date(at));
    expect(store.calls.materialize).toEqual([['b-1', 150_000 - 100]]);
  });

  it('refuses unapproved templates, incomplete variables, RED numbers and over-limit audiences', async () => {
    const enqueue = vi.fn(async () => undefined);
    const run = (store: LaunchStore, scheduledAt?: string) =>
      launchBroadcast({ store, queue: { enqueue }, now: () => NOW }, { workspace: { id: WS, plan: 'free' }, broadcastId: 'b-1', scheduledAt });

    await expect(run(launchStore({ getTemplate: async () => ({ ...TEMPLATE, status: 'PENDING' }) }))).rejects.toMatchObject({ code: 'TEMPLATE_NOT_APPROVED' });
    await expect(
      run(launchStore({ getBroadcast: async () => ({ id: 'b-1', status: 'draft', template_id: TEMPLATE.id, phone_number_id: 'ph-1', variable_mapping: {} }) })),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    await expect(run(launchStore({ getPhone: async () => ({ id: 'ph-1', quality_rating: 'RED', status: 'CONNECTED' }) }))).rejects.toThrow(/RED/);
    await expect(run(launchStore({ materialize: async () => Promise.reject(new Error('plan_limit:400:150')) }))).rejects.toMatchObject({
      code: 'PLAN_LIMIT',
      status: 403,
    });
    await expect(run(launchStore({ materialize: async () => ({ total: 3, sendable: 0, skipped: 3 }) }))).rejects.toBeInstanceOf(ApiError);
    await expect(run(launchStore(), '2026-10-01T00:00:00Z')).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(enqueue).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Slice processor
// ---------------------------------------------------------------------------

interface MemRecipient extends RecipientRow {
  status: string;
  error: string | null;
  wamid: string | null;
}

function memoryStore(opts: { recipients: number; optedOut?: number[]; tier?: string; sent24h?: number; quality?: string }) {
  const contacts = new Map<string, ProcessContactRow>();
  const recipients: MemRecipient[] = [];
  for (let i = 0; i < opts.recipients; i++) {
    const id = `c-${i}`;
    contacts.set(id, { id, name: i === 0 ? 'Ayesha Khan' : null, profile_name: null, wa_id: `9230000000${String(i).padStart(2, '0')}`, custom_fields: {}, opted_out: opts.optedOut?.includes(i) ?? false });
    recipients.push({ id: `r-${i}`, contact_id: id, wa_id: contacts.get(id)!.wa_id, attempts: 0, status: 'pending', error: null, wamid: null });
  }
  const state = { status: 'sending', paused: null as string | null, optedOut: [] as string[] };
  const store: BroadcastStore = {
    getBroadcast: async () => ({ id: 'b-1', workspace_id: WS, status: state.status, phone_number_id: 'ph-1', variable_mapping: MAPPING, template: TEMPLATE }),
    getPhone: async () => ({ id: 'ph-1', phone_number_id: 'META-PH', quality_rating: opts.quality ?? 'GREEN', messaging_limit_tier: opts.tier ?? 'TIER_1K' }),
    sentInLast24h: async () => opts.sent24h ?? 0,
    markSending: async () => {
      state.status = 'sending';
    },
    claimRecipients: async (_id, limit) => {
      const batch = recipients.filter((r) => r.status === 'pending').slice(0, limit);
      batch.forEach((r) => {
        r.status = 'sending';
        r.attempts++;
      });
      return batch.map((r) => ({ id: r.id, contact_id: r.contact_id, wa_id: r.wa_id, attempts: r.attempts }));
    },
    getContacts: async (_ws, ids) => new Map(ids.map((id) => [id, contacts.get(id)!])),
    recordMessage: async (input) => ({ id: `m-${input.clientMessageId}`, status: 'queued', wamid: null, duplicate: false }),
    markSent: async ({ recipientId, wamid }) => {
      const r = recipients.find((x) => x.id === recipientId)!;
      r.status = 'sent';
      r.wamid = wamid;
    },
    markFailed: async ({ recipientId, message }) => {
      const r = recipients.find((x) => x.id === recipientId)!;
      r.status = 'failed';
      r.error = message;
    },
    retryLater: async (recipientId, _at, message) => {
      const r = recipients.find((x) => x.id === recipientId)!;
      r.status = 'retry';
      r.error = message;
    },
    skip: async (recipientId, reason) => {
      const r = recipients.find((x) => x.id === recipientId)!;
      r.status = 'skipped';
      r.error = reason;
    },
    markContactOptedOut: async (contactId) => {
      state.optedOut.push(contactId);
    },
    pause: async (_id, reason) => {
      state.status = 'paused';
      state.paused = reason;
    },
    completeIfDone: async () => !recipients.some((r) => r.status === 'pending' || r.status === 'sending'),
  };
  return { store, recipients, state };
}

function fakeClient(fail?: (to: string) => Error | null) {
  const sent: { to: string; payload: MessagePayload }[] = [];
  const client = {
    sendMessage: vi.fn(async (_phone: string, to: string, payload: MessagePayload) => {
      const error = fail?.(to);
      if (error) throw error;
      sent.push({ to, payload });
      return { wamid: `wamid.${to}`, waId: to, messageStatus: 'accepted', raw: {} };
    }),
  } as unknown as WhatsAppApi;
  return { client, sent };
}

const metaError = (code: number, status = 400) =>
  normalizeGraphError(status, { error: { message: 'Meta error', type: 'OAuthException', code, fbtrace_id: 'x' } });

describe('broadcast processor', () => {
  const deadline = () => Date.now() + 10_000;

  it('resolves per-contact variables and skips opted-out contacts for marketing', async () => {
    const { store, recipients } = memoryStore({ recipients: 4, optedOut: [2] });
    const { client, sent } = fakeClient();
    const result = await processBroadcast({ store, getClient: async () => client, log: logger }, 'b-1', { deadline: deadline() });

    expect(result).toMatchObject({ sent: 3, skipped: 1, failed: 0, done: true, paused: null });
    expect(recipients.find((r) => r.id === 'r-2')).toMatchObject({ status: 'skipped', error: 'Contact opted out' });
    expect(sent[0]!.payload).toEqual({
      type: 'template',
      template: {
        name: 'eid_sale',
        language: { code: 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: 'Ayesha' }, { type: 'text', text: '20%' }] }],
      },
    });
    // No name → fallback value
    expect(JSON.stringify(sent[1]!.payload)).toContain('"text":"there"');
  });

  it('stops at the 24h messaging tier and waits for capacity', async () => {
    const { store, recipients } = memoryStore({ recipients: 10, tier: 'TIER_50', sent24h: 47 });
    const { client, sent } = fakeClient();
    const result = await processBroadcast({ store, getClient: async () => client, log: logger }, 'b-1', { deadline: deadline() });
    expect(sent).toHaveLength(3);
    expect(result).toMatchObject({ done: false, waiting: 'tier_limit' });
    expect(recipients.filter((r) => r.status === 'pending')).toHaveLength(7);
  });

  it('pauses on RED quality before sending anything', async () => {
    const { store, state } = memoryStore({ recipients: 3, quality: 'RED' });
    const { client } = fakeClient();
    const result = await processBroadcast({ store, getClient: async () => client, log: logger }, 'b-1', { deadline: deadline() });
    expect(result.paused).toMatch(/RED/);
    expect(state.status).toBe('paused');
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('retries retryable errors, records opt-outs from WhatsApp and pauses on spam limits', async () => {
    const { store, recipients, state } = memoryStore({ recipients: 3 });
    const { client } = fakeClient((to) =>
      to.endsWith('00') ? metaError(131000, 500) : to.endsWith('01') ? metaError(131050) : metaError(131048),
    );
    const result = await processBroadcast({ store, getClient: async () => client, log: logger }, 'b-1', { deadline: deadline() });

    expect(recipients.find((r) => r.id === 'r-0')!.status).toBe('retry');
    expect(recipients.find((r) => r.id === 'r-1')!.status).toBe('failed');
    expect(state.optedOut).toEqual(['c-1']);
    expect(result.paused).toMatch(/Paused automatically/);
    expect(state.status).toBe('paused');
  });

  it('resolves variable sources with fallbacks', () => {
    const values = resolveTemplateValues(
      {
        header: [{ source: 'custom_field', key: 'city', fallback: 'your city' }],
        body: [{ source: 'contact.name', fallback: 'friend' }, { source: 'contact.phone' }],
        buttons: { '0': { source: 'static', value: 'EID20' } },
      },
      { name: null, profile_name: 'Bilal', wa_id: '923001234567', custom_fields: { city: '' } },
    );
    expect(values).toEqual({ header: ['your city'], body: ['Bilal', '+923001234567'], buttons: { 0: 'EID20' }, headerMedia: undefined });
  });
});
