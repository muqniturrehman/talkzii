import { vi } from 'vitest';
import type {
  ApplyStatusResult,
  RecordInboundInput,
  RecordInboundResult,
  WebhookStore,
} from '@/lib/webhooks/meta/types';

const RANK: Record<string, number> = { queued: 0, sent: 1, failed: 2, delivered: 3, read: 4, deleted: 5 };

/** In-memory WebhookStore mirroring the SQL functions' semantics. */
export function createMemoryWebhookStore(knownPhoneIds: string[] = ['PN1']) {
  const messages = new Map<string, { id: string; conversationId: string; status: string; direction: 'inbound' | 'outbound' }>();
  const conversations = new Map<string, { unread: number; expiresAt: Date | null }>();
  const recorded: RecordInboundInput[] = [];

  const store: WebhookStore & { seedOutbound(wamid: string, conversationId: string): void } = {
    seedOutbound(wamid, conversationId) {
      messages.set(wamid, { id: `msg-${wamid}`, conversationId, status: 'sent', direction: 'outbound' });
      conversations.set(conversationId, conversations.get(conversationId) ?? { unread: 0, expiresAt: new Date(Date.now() + 3_600_000) });
    },
    recordInboundMessage: vi.fn(async (input: RecordInboundInput): Promise<RecordInboundResult> => {
      if (!knownPhoneIds.includes(input.phoneNumberId)) return { status: 'unknown_phone_number' };
      const existing = messages.get(input.wamid);
      if (existing) return { status: 'duplicate', message_id: existing.id, conversation_id: existing.conversationId, workspace_id: 'ws-1' };
      recorded.push(input);
      const conversationId = `conv-${input.waId}`;
      const conv = conversations.get(conversationId) ?? { unread: 0, expiresAt: null };
      conv.unread += 1;
      conv.expiresAt = new Date(input.timestamp.getTime() + 24 * 3_600_000);
      conversations.set(conversationId, conv);
      const id = `msg-${input.wamid}`;
      messages.set(input.wamid, { id, conversationId, status: 'received', direction: 'inbound' });
      return { status: 'created', message_id: id, conversation_id: conversationId, contact_id: `contact-${input.waId}`, workspace_id: 'ws-1', phone_number_id: 'phone-row-1' };
    }),
    applyMessageStatus: vi.fn(async (input): Promise<ApplyStatusResult> => {
      const msg = messages.get(input.wamid);
      if (!msg) {
        return { found: false, message_id: null, conversation_id: null, workspace_id: null, message_updated: false, recipients_updated: 0, broadcast_id: null };
      }
      const updated = (RANK[input.status] ?? 0) > (RANK[msg.status] ?? 0);
      if (updated) msg.status = input.status;
      return { found: true, message_id: msg.id, conversation_id: msg.conversationId, workspace_id: 'ws-1', message_updated: updated, recipients_updated: 0, broadcast_id: null };
    }),
    closeSessionWindow: vi.fn(async (conversationId: string, at: Date) => {
      const conv = conversations.get(conversationId);
      if (conv) conv.expiresAt = at;
    }),
    updateTemplateStatus: vi.fn(async () => ({ workspaceId: 'ws-1', templateId: 'tpl-row-1' })),
    updateTemplateQuality: vi.fn(async () => undefined),
    updateTemplateCategory: vi.fn(async () => undefined),
    recordPhoneQuality: vi.fn(async (input) => ({
      workspaceId: 'ws-1',
      phoneRowId: 'phone-row-1',
      qualityRating: input.event === 'FLAGGED' ? 'RED' : 'GREEN',
    })),
    pauseBroadcastsForPhone: vi.fn(async () => 2),
    updatePhoneName: vi.fn(async () => undefined),
    updateWabaReview: vi.fn(async () => undefined),
    recordWabaEvent: vi.fn(async () => undefined),
  };

  return { store, messages, conversations, recorded };
}
