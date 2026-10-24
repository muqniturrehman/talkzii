import { describe, expect, it } from 'vitest';
import {
  computeWebhookSignature,
  messagePreviewText,
  parseWebhookPayload,
  verifyWebhookChallenge,
  verifyWebhookSignature,
} from '../src';

const SECRET = 'meta-app-secret';

function envelope(field: string, value: unknown) {
  return { object: 'whatsapp_business_account', entry: [{ id: 'WABA1', changes: [{ field, value }] }] };
}

const meta = { messaging_product: 'whatsapp', metadata: { display_phone_number: '923000000000', phone_number_id: 'PN1' } };

describe('webhook signature verification', () => {
  const body = JSON.stringify(envelope('messages', meta));

  it('accepts the exact raw body signed with the app secret', () => {
    expect(verifyWebhookSignature(body, computeWebhookSignature(body, SECRET), SECRET)).toBe(true);
  });

  it('rejects tampered bodies, wrong secrets and malformed headers', () => {
    const signature = computeWebhookSignature(body, SECRET);
    expect(verifyWebhookSignature(body.replace('PN1', 'PN2'), signature, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, computeWebhookSignature(body, 'other'), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, signature.replace('sha256=', 'sha1='), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, 'sha256=nothex', SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, signature, '')).toBe(false);
  });

  it('answers the GET verification challenge only with the right token', () => {
    const ok = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'tok', 'hub.challenge': '1158201444' });
    expect(verifyWebhookChallenge(ok, 'tok')).toBe('1158201444');
    expect(verifyWebhookChallenge(ok, 'nope')).toBeNull();
    expect(verifyWebhookChallenge(new URLSearchParams({ 'hub.mode': 'unsubscribe' }), 'tok')).toBeNull();
  });
});

describe('parseWebhookPayload', () => {
  it('normalises inbound text, media, interactive and reaction messages', () => {
    const events = parseWebhookPayload(
      envelope('messages', {
        ...meta,
        contacts: [{ profile: { name: 'Ayesha' }, wa_id: '923335550001' }],
        messages: [
          { from: '923335550001', id: 'wamid.T', timestamp: '1760000000', type: 'text', text: { body: 'Salam!' } },
          { from: '923335550001', id: 'wamid.I', timestamp: '1760000001', type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'This one' } },
          {
            from: '923335550001',
            id: 'wamid.B',
            timestamp: '1760000002',
            type: 'interactive',
            interactive: { type: 'button_reply', button_reply: { id: 'agent', title: 'Talk to agent' } },
            context: { from: '923000000000', id: 'wamid.BOT' },
          },
          { from: '923335550001', id: 'wamid.R', timestamp: '1760000003', type: 'reaction', reaction: { message_id: 'wamid.X', emoji: '👍' } },
          { from: '923335550001', id: 'wamid.U', timestamp: '1760000004', type: 'poll_vote' },
        ],
      }),
    );

    expect(events).toHaveLength(5);
    const [text, image, button, reaction, unknown] = events;
    expect(text).toMatchObject({
      kind: 'message',
      wabaId: 'WABA1',
      phoneNumberId: 'PN1',
      contact: { waId: '923335550001', profileName: 'Ayesha' },
      message: { wamid: 'wamid.T', type: 'text', text: 'Salam!' },
    });
    if (text?.kind === 'message') expect(text.message.timestamp.toISOString()).toBe('2025-10-09T08:53:20.000Z');
    expect(image).toMatchObject({ message: { type: 'image', text: 'This one', media: { id: 'MEDIA1', mimeType: 'image/jpeg' } } });
    expect(button).toMatchObject({
      message: { type: 'interactive', text: 'Talk to agent', interactive: { id: 'agent' }, context: { id: 'wamid.BOT' } },
    });
    expect(reaction).toMatchObject({ message: { type: 'reaction', reaction: { messageId: 'wamid.X', emoji: '👍' } } });
    expect(unknown).toMatchObject({ message: { type: 'unsupported', rawType: 'poll_vote' } });
  });

  it('normalises statuses with pricing, conversation and errors', () => {
    const events = parseWebhookPayload(
      envelope('messages', {
        ...meta,
        statuses: [
          {
            id: 'wamid.OUT',
            status: 'delivered',
            timestamp: '1760000100',
            recipient_id: '923335550001',
            conversation: { id: 'CONV1', expiration_timestamp: '1760086500', origin: { type: 'marketing' } },
            pricing: { billable: true, pricing_model: 'PMP', category: 'marketing', type: 'regular' },
          },
          {
            id: 'wamid.FAIL',
            status: 'failed',
            timestamp: '1760000200',
            recipient_id: '923335550002',
            errors: [{ code: 131026, title: 'Message undeliverable' }],
          },
          { id: 'wamid.W', status: 'warning', timestamp: '1760000300', recipient_id: '1' },
        ],
      }),
    );
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      kind: 'status',
      status: {
        wamid: 'wamid.OUT',
        status: 'delivered',
        conversation: { id: 'CONV1', category: 'marketing' },
        pricing: { billable: true, model: 'PMP', category: 'marketing', type: 'regular' },
      },
    });
    expect(events[1]).toMatchObject({ status: { status: 'failed', errors: [{ code: 131026 }] } });
  });

  it('handles template, phone, account and capability updates', () => {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [
        {
          id: 'WABA1',
          changes: [
            {
              field: 'message_template_status_update',
              value: { event: 'REJECTED', message_template_id: 9001, message_template_name: 'promo', message_template_language: 'en', reason: 'INVALID_FORMAT' },
            },
            { field: 'phone_number_quality_update', value: { display_phone_number: '923000000000', event: 'DOWNGRADE', current_limit: 'TIER_250' } },
            { field: 'phone_number_name_update', value: { display_phone_number: '923000000000', decision: 'APPROVED', requested_verified_name: 'Demo Store', rejection_reason: 'NONE' } },
            { field: 'account_review_update', value: { decision: 'APPROVED' } },
            { field: 'account_update', value: { event: 'ACCOUNT_RESTRICTION', phone_number: '923000000000', restriction_info: [{ restriction_type: 'RESTRICTED_ADD_PHONE_NUMBER_ACTION' }] } },
            { field: 'business_capability_update', value: { max_daily_conversation_per_phone: 1000, max_phone_numbers_per_business: 2 } },
            { field: 'flows', value: { foo: 'bar' } },
          ],
        },
      ],
    };
    const kinds = parseWebhookPayload(payload).map((e) => e.kind);
    expect(kinds).toEqual([
      'template_status',
      'phone_quality',
      'phone_name',
      'account_review',
      'account_update',
      'business_capability',
      'unknown',
    ]);
    const [template, quality, name, , account, capability] = parseWebhookPayload(payload);
    expect(template).toMatchObject({ templateId: '9001', event: 'REJECTED', reason: 'INVALID_FORMAT' });
    expect(quality).toMatchObject({ event: 'DOWNGRADE', currentLimit: 'TIER_250' });
    expect(name).toMatchObject({ decision: 'APPROVED', rejectionReason: null });
    expect(account).toMatchObject({ event: 'ACCOUNT_RESTRICTION', phoneNumber: '923000000000' });
    expect(capability).toMatchObject({ maxDailyConversationsPerPhone: 1000, maxPhoneNumbersPerWaba: null });
  });

  it('ignores payloads that are not WhatsApp Business Account webhooks', () => {
    expect(parseWebhookPayload({ object: 'page', entry: [] })).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
  });

  it('builds readable previews', () => {
    expect(messagePreviewText({ type: 'audio', text: null, media: { id: '1', mimeType: null, sha256: null, caption: null, filename: null, voice: true, animated: false }, location: null, reaction: null })).toBe('🎤 Voice message');
    expect(messagePreviewText({ type: 'location', text: null, media: null, location: { latitude: 1, longitude: 2, name: 'Shop', address: null }, reaction: null })).toBe('📍 Shop');
  });
});
