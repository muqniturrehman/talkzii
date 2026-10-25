import { describe, expect, it, vi } from 'vitest';
import { WhatsAppClient } from '@talkzi/whatsapp';
import { sendMessageSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import type { WhatsAppApi } from '@/lib/meta/whatsapp';
import {
  sendMessage,
  renderCannedReply,
  type ConversationForSend,
  type MessagingStore,
  type OutboundRecord,
  type RecordOutboundInput,
  type TemplateForSend,
} from '@/lib/messaging/send';
import { assertCanSendFreeForm, formatSessionTimeLeft, isSessionOpen, sessionTimeLeft } from '@/lib/messaging/session-window';

const NOW = new Date('2026-10-24T12:00:00Z');
const hoursFromNow = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();

function conversation(overrides: Partial<ConversationForSend> = {}): ConversationForSend {
  return {
    id: 'conv-1',
    workspace_id: 'ws-1',
    contact_id: 'contact-1',
    phone_number_id: 'phone-row-1',
    expires_at: hoursFromNow(5),
    contact: { wa_id: '923001234567', opted_out: false, name: 'Ayesha Khan', profile_name: 'Ayesha' },
    ...overrides,
  };
}

const approvedTemplate: TemplateForSend = {
  id: 'tpl-1',
  name: 'order_update',
  language: 'en',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [
    { type: 'BODY', text: 'Hi {{1}}, your order {{2}} has shipped.' },
    { type: 'BUTTONS', buttons: [{ type: 'URL', text: 'Track', url: 'https://t.test/{{1}}' }] },
  ],
};

function memoryStore(opts: { conv?: ConversationForSend | null; templates?: TemplateForSend[]; existing?: OutboundRecord } = {}) {
  const recorded: RecordOutboundInput[] = [];
  const sent: { id: string; wamid: string }[] = [];
  const failed: { id: string; code: number | null; message: string }[] = [];
  const store: MessagingStore = {
    getConversation: vi.fn(async () => (opts.conv === undefined ? conversation() : opts.conv)),
    getTemplate: vi.fn(async (_ws, id) => opts.templates?.find((t) => t.id === id) ?? null),
    getMessageWamid: vi.fn(async () => 'wamid.QUOTED'),
    recordOutbound: vi.fn(async (input) => {
      recorded.push(input);
      return opts.existing ?? { id: 'msg-1', conversation_id: input.conversationId, status: 'queued', wamid: null, duplicate: false, created_at: NOW.toISOString() };
    }),
    markSent: vi.fn(async (id, wamid) => {
      sent.push({ id, wamid });
    }),
    markFailed: vi.fn(async (id, err) => {
      failed.push({ id, ...err });
    }),
  };
  return { store, recorded, sent, failed };
}

function fakeClient(impl?: Partial<WhatsAppApi>) {
  const sendMessageFn = vi.fn(async () => ({ wamid: 'wamid.SENT', waId: '923001234567', messageStatus: null, raw: { messaging_product: 'whatsapp' as const, contacts: [], messages: [] } }));
  return { client: { sendMessage: sendMessageFn, ...impl } as unknown as WhatsAppApi, sendMessageFn };
}

const ctx = { workspaceId: 'ws-1', senderId: 'agent-1', senderType: 'agent' as const };
const parse = (input: unknown) => sendMessageSchema.parse(input);

describe('24-hour customer service window', () => {
  it('is open until 24h after the last inbound message', () => {
    expect(isSessionOpen(hoursFromNow(1), NOW)).toBe(true);
    expect(isSessionOpen(hoursFromNow(-0.01), NOW)).toBe(false);
    expect(isSessionOpen(null, NOW)).toBe(false);
    expect(sessionTimeLeft(hoursFromNow(2.5), NOW)).toBe(2.5 * 3_600_000);
    expect(formatSessionTimeLeft(sessionTimeLeft(hoursFromNow(23.2), NOW))).toBe('23h 12m left');
    expect(formatSessionTimeLeft(0)).toBe('Session expired');
  });

  it('throws SESSION_WINDOW_CLOSED for free-form sends after the window', () => {
    expect(() => assertCanSendFreeForm(hoursFromNow(-1), NOW)).toThrowError(
      expect.objectContaining({ code: 'SESSION_WINDOW_CLOSED', status: 409 }),
    );
    expect(() => assertCanSendFreeForm(hoursFromNow(1), NOW)).not.toThrow();
  });
});

describe('sendMessage (mocked Cloud API)', () => {
  it('sends text inside the window through the real client and stores the wamid', async () => {
    const calls: { url: string; body: unknown }[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ messaging_product: 'whatsapp', contacts: [{ input: '923001234567', wa_id: '923001234567' }], messages: [{ id: 'wamid.REAL' }] }), { status: 200 });
    }) as unknown as typeof fetch;
    const client = new WhatsAppClient({ accessToken: 'tok', fetch: fetchImpl });
    const { store, recorded, sent } = memoryStore();

    const result = await sendMessage(
      parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'text', text: 'Your order is on the way 🚚', replyToMessageId: '3c2d1e0f-1a2b-4c3d-9e8f-7a6b5c4d3e2f' }),
      ctx,
      { store, getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }), now: () => NOW },
    );

    expect(result).toEqual({ id: 'msg-1', conversationId: 'conv-1', wamid: 'wamid.REAL', status: 'sent', duplicate: false });
    expect(calls[0]!.url).toBe('https://graph.facebook.com/v21.0/PN1/messages');
    expect(calls[0]!.body).toMatchObject({ to: '923001234567', type: 'text', text: { body: 'Your order is on the way 🚚' }, context: { message_id: 'wamid.QUOTED' } });
    expect(recorded[0]).toMatchObject({ type: 'text', senderType: 'agent', senderId: 'agent-1', body: 'Your order is on the way 🚚', replyToWamid: 'wamid.QUOTED' });
    expect(sent).toEqual([{ id: 'msg-1', wamid: 'wamid.REAL' }]);
  });

  it('refuses free-form text after the window without calling Meta', async () => {
    const { store, recorded } = memoryStore({ conv: conversation({ expires_at: hoursFromNow(-3) }) });
    const { client, sendMessageFn } = fakeClient();
    await expect(
      sendMessage(parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'text', text: 'hello?' }), ctx, {
        store,
        getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }),
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_WINDOW_CLOSED' });
    expect(sendMessageFn).not.toHaveBeenCalled();
    expect(recorded).toHaveLength(0);
  });

  it('allows approved templates outside the window and builds components', async () => {
    const { store, recorded } = memoryStore({ conv: conversation({ expires_at: null }), templates: [approvedTemplate] });
    const { client, sendMessageFn } = fakeClient();
    await sendMessage(
      parse({
        conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d',
        type: 'template',
        templateId: '9f8e7d6c-5b4a-4321-8fed-cba987654321'.replace(/.*/, 'tpl-1').length ? '9f8e7d6c-5b4a-4321-8fed-cba987654321' : '',
        variables: { body: ['Ayesha', 'TZ-1042'], buttons: { '0': 'TZ-1042' } },
      }),
      ctx,
      {
        store: { ...store, getTemplate: async () => approvedTemplate },
        getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }),
        now: () => NOW,
      },
    );
    expect(sendMessageFn).toHaveBeenCalledWith(
      'PN1',
      '923001234567',
      {
        type: 'template',
        template: {
          name: 'order_update',
          language: { code: 'en' },
          components: [
            { type: 'body', parameters: [{ type: 'text', text: 'Ayesha' }, { type: 'text', text: 'TZ-1042' }] },
            { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'TZ-1042' }] },
          ],
        },
      },
      { replyTo: undefined },
    );
    expect(recorded[0]).toMatchObject({ type: 'template', templateId: 'tpl-1', body: 'Hi Ayesha, your order TZ-1042 has shipped.' });
  });

  it('blocks unapproved templates, opted-out marketing and missing variables', async () => {
    const { client } = fakeClient();
    const base = { conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'template', templateId: '9f8e7d6c-5b4a-4321-8fed-cba987654321' };
    const run = (template: TemplateForSend, conv = conversation(), variables: object = { body: ['A', 'B'], buttons: { '0': 'x' } }) =>
      sendMessage(parse({ ...base, variables }), ctx, {
        store: { ...memoryStore({ conv }).store, getTemplate: async () => template },
        getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }),
        now: () => NOW,
      });

    await expect(run({ ...approvedTemplate, status: 'PENDING' })).rejects.toMatchObject({ code: 'TEMPLATE_NOT_APPROVED' });
    await expect(
      run({ ...approvedTemplate, category: 'MARKETING' }, conversation({ contact: { ...conversation().contact, opted_out: true } })),
    ).rejects.toMatchObject({ code: 'CONTACT_OPTED_OUT' });
    await expect(run(approvedTemplate, conversation(), { body: ['only-one'] })).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('marks the message failed and maps Meta error 131047 to SESSION_WINDOW_CLOSED', async () => {
    const { store, failed } = memoryStore();
    const { WhatsAppApiError } = await import('@talkzi/whatsapp');
    const { client } = fakeClient({
      sendMessage: vi.fn(async () => {
        throw new WhatsAppApiError({ message: 'Re-engagement message', status: 400, code: 131047, category: 'policy', retryable: false });
      }),
    });
    const error = await sendMessage(parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'text', text: 'hi' }), ctx, {
      store,
      getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }),
      now: () => NOW,
    }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ code: 'SESSION_WINDOW_CLOSED' });
    expect(failed[0]).toMatchObject({ id: 'msg-1', code: 131047 });
  });

  it('enforces the monthly message allowance when the plan is known', async () => {
    const atLimit = memoryStore();
    atLimit.store.messagesSentThisMonth = vi.fn(async () => 1_000);
    const { client, sendMessageFn } = fakeClient();
    const deps = { store: atLimit.store, getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }), now: () => NOW };
    const input = parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'text', text: 'hi' });

    await expect(sendMessage(input, { ...ctx, plan: 'free' }, deps)).rejects.toMatchObject({ status: 403, code: 'PLAN_LIMIT' });
    expect(sendMessageFn).not.toHaveBeenCalled();
    expect(atLimit.recorded).toHaveLength(0);

    // Pro allows 50,000 a month; without a plan in context nothing is enforced.
    await expect(sendMessage(input, { ...ctx, plan: 'pro' }, deps)).resolves.toMatchObject({ status: 'sent' });
    await expect(sendMessage(input, ctx, deps)).resolves.toMatchObject({ status: 'sent' });
  });

  it('is idempotent on clientMessageId', async () => {
    const { store } = memoryStore({
      existing: { id: 'msg-9', conversation_id: 'conv-1', status: 'sent', wamid: 'wamid.ALREADY', duplicate: true, created_at: NOW.toISOString() },
    });
    const { client, sendMessageFn } = fakeClient();
    const result = await sendMessage(
      parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'text', text: 'hi', clientMessageId: 'client-abc-123' }),
      ctx,
      { store, getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }), now: () => NOW },
    );
    expect(result).toMatchObject({ id: 'msg-9', wamid: 'wamid.ALREADY', duplicate: true });
    expect(sendMessageFn).not.toHaveBeenCalled();
  });

  it('sends media by uploaded id with caption', async () => {
    const { store, recorded } = memoryStore();
    const { client, sendMessageFn } = fakeClient();
    await sendMessage(
      parse({ conversationId: '2b1d3c4e-5f60-4a7b-8c9d-0e1f2a3b4c5d', type: 'image', mediaId: 'MEDIA42', caption: 'New stock', mimeType: 'image/jpeg' }),
      ctx,
      { store, getClient: async () => ({ client, metaPhoneNumberId: 'PN1' }), now: () => NOW },
    );
    expect(sendMessageFn).toHaveBeenCalledWith('PN1', '923001234567', { type: 'image', image: { id: 'MEDIA42', caption: 'New stock' } }, { replyTo: undefined });
    expect(recorded[0]).toMatchObject({ type: 'image', body: 'New stock', media: { id: 'MEDIA42', mimeType: 'image/jpeg' } });
  });
});

describe('canned replies', () => {
  it('personalises placeholders', () => {
    expect(renderCannedReply('Hi {{contact.first_name}}! We will call {{contact.phone}}.', conversation().contact)).toBe(
      'Hi Ayesha! We will call +923001234567.',
    );
  });
});
