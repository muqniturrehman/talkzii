import type { NormalizedMessage, NormalizedStatus, PricingCategory } from '@talkzi/whatsapp';
import type { MessageType } from '@talkzi/db';

export interface RecordInboundInput {
  phoneNumberId: string;
  waId: string;
  profileName: string | null;
  wamid: string;
  type: MessageType;
  timestamp: Date;
  body: string | null;
  content: Record<string, unknown>;
  media: Record<string, unknown> | null;
  replyToWamid: string | null;
}

export type RecordInboundResult =
  | {
      status: 'created';
      message_id: string;
      conversation_id: string;
      contact_id: string;
      workspace_id: string;
      phone_number_id: string;
    }
  | { status: 'duplicate'; message_id?: string; conversation_id?: string; workspace_id: string }
  | { status: 'unknown_phone_number' };

export interface ApplyStatusInput {
  wamid: string;
  status: NormalizedStatus['status'];
  timestamp: Date;
  errorCode: number | null;
  errorMessage: string | null;
  pricingCategory: PricingCategory | null;
  pricingBillable: boolean | null;
  pricingModel: string | null;
  pricingType: string | null;
  metaConversationId: string | null;
  metaConversationExpiresAt: Date | null;
}

export interface ApplyStatusResult {
  found: boolean;
  message_id: string | null;
  conversation_id: string | null;
  workspace_id: string | null;
  message_updated: boolean;
  recipients_updated: number;
  broadcast_id: string | null;
}

/** Persistence port for webhook processing (Supabase in prod, memory in tests). */
export interface WebhookStore {
  recordInboundMessage(input: RecordInboundInput): Promise<RecordInboundResult>;
  applyMessageStatus(input: ApplyStatusInput): Promise<ApplyStatusResult>;
  closeSessionWindow(conversationId: string, at: Date): Promise<void>;
  updateTemplateStatus(input: {
    wabaId: string;
    metaTemplateId: string;
    name: string | null;
    language: string | null;
    event: string;
    reason: string | null;
  }): Promise<{ workspaceId: string; templateId: string } | null>;
  updateTemplateQuality(input: { wabaId: string; metaTemplateId: string; score: string | null }): Promise<void>;
  updateTemplateCategory(input: { wabaId: string; metaTemplateId: string; category: string | null }): Promise<void>;
  recordPhoneQuality(input: {
    wabaId: string;
    displayPhoneNumber: string;
    event: string;
    currentLimit: string | null;
    payload: Record<string, unknown>;
  }): Promise<{ workspaceId: string; phoneRowId: string; qualityRating: string } | null>;
  pauseBroadcastsForPhone(phoneRowId: string, reason: string): Promise<number>;
  updatePhoneName(input: {
    wabaId: string;
    displayPhoneNumber: string;
    decision: string;
    requestedName: string | null;
    rejectionReason: string | null;
  }): Promise<void>;
  updateWabaReview(input: { wabaId: string; decision: string }): Promise<void>;
  recordWabaEvent(input: { wabaId: string; key: string; value: Record<string, unknown>; status?: 'connected' | 'error' }): Promise<void>;
}

export interface InboundContext {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  messageId: string;
  phoneNumberRowId: string;
  metaPhoneNumberId: string;
  contactWaId: string;
  profileName: string | null;
  message: NormalizedMessage;
}

export interface StatusContext {
  workspaceId: string;
  conversationId: string | null;
  messageId: string | null;
  broadcastId: string | null;
  status: NormalizedStatus;
}

/** Side effects after persistence: compliance, chatbots, outbound webhooks… */
export interface WebhookHooks {
  onInboundMessage?(ctx: InboundContext): Promise<void>;
  onStatus?(ctx: StatusContext): Promise<void>;
  onTemplateStatus?(ctx: { workspaceId: string; templateId: string; status: string; reason: string | null }): Promise<void>;
}

export interface ProcessSummary {
  events: number;
  messages: number;
  duplicates: number;
  statuses: number;
  unknownPhone: number;
  other: number;
  hookErrors: number;
}
