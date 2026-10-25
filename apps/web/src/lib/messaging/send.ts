import {
  buildTemplateSendComponents,
  isWhatsAppApiError,
  renderTemplatePreview,
  SESSION_WINDOW_ERROR_CODES,
  summarizeTemplate,
  type MediaRef,
  type MessagePayload,
} from '@talkzi/whatsapp';
import { planLimit, type PlanId, type SendMessageInput } from '@talkzi/shared';
import type { MessageType, SenderType } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import type { WhatsAppApi } from '@/lib/meta/whatsapp';
import { assertCanSendFreeForm } from './session-window';

export interface ConversationForSend {
  id: string;
  workspace_id: string;
  contact_id: string;
  phone_number_id: string;
  expires_at: string | null;
  contact: { wa_id: string; opted_out: boolean; name: string | null; profile_name: string | null };
}

export interface TemplateForSend {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
}

export interface RecordOutboundInput {
  workspaceId: string;
  conversationId: string;
  contactId: string;
  phoneNumberRowId: string;
  type: MessageType;
  senderType: SenderType;
  senderId: string | null;
  body: string | null;
  content: Record<string, unknown>;
  media: Record<string, unknown> | null;
  templateId: string | null;
  broadcastId?: string | null;
  clientMessageId: string | null;
  replyToWamid: string | null;
}

export interface OutboundRecord {
  id: string;
  conversation_id: string;
  status: string;
  wamid: string | null;
  duplicate: boolean;
  created_at: string;
}

export interface MessagingStore {
  getConversation(workspaceId: string, conversationId: string): Promise<ConversationForSend | null>;
  getTemplate(workspaceId: string, templateId: string): Promise<TemplateForSend | null>;
  getMessageWamid(workspaceId: string, messageId: string): Promise<string | null>;
  recordOutbound(input: RecordOutboundInput): Promise<OutboundRecord>;
  markSent(messageId: string, wamid: string, workspaceId: string): Promise<void>;
  markFailed(messageId: string, error: { code: number | null; message: string }): Promise<void>;
  /** Outbound messages counted against the plan this month (messages_per_month). */
  messagesSentThisMonth?(workspaceId: string): Promise<number>;
}

export interface SendDeps {
  store: MessagingStore;
  getClient: (workspaceId: string, phoneNumberRowId: string) => Promise<{ client: WhatsAppApi; metaPhoneNumberId: string }>;
  now?: () => Date;
}

export interface SendContext {
  workspaceId: string;
  senderId: string | null;
  senderType: SenderType;
  /** When set, the plan's monthly message allowance is enforced. */
  plan?: PlanId;
}

export interface SentMessage {
  id: string;
  conversationId: string;
  wamid: string | null;
  status: string;
  duplicate: boolean;
}

interface Prepared {
  dbType: MessageType;
  payload: MessagePayload;
  body: string | null;
  content: Record<string, unknown>;
  media: Record<string, unknown> | null;
  templateId: string | null;
}

async function prepare(input: SendMessageInput, conversation: ConversationForSend, ctx: SendContext, deps: SendDeps, now: Date): Promise<Prepared> {
  if (input.type === 'template') {
    const template = await deps.store.getTemplate(ctx.workspaceId, input.templateId);
    if (!template) throw ApiError.notFound('Template not found.');
    if (template.status !== 'APPROVED') {
      throw ApiError.conflict(`“${template.name}” is ${template.status.toLowerCase()} — only approved templates can be sent.`, 'TEMPLATE_NOT_APPROVED');
    }
    if (template.category === 'MARKETING' && conversation.contact.opted_out) {
      throw ApiError.conflict('This contact opted out of marketing messages.', 'CONTACT_OPTED_OUT');
    }
    const summary = summarizeTemplate(template.components);
    const values = {
      header: input.variables.header,
      body: input.variables.body,
      buttons: input.variables.buttons
        ? Object.fromEntries(Object.entries(input.variables.buttons).map(([k, v]) => [Number(k), v]))
        : undefined,
      headerMedia: input.variables.headerMediaUrl ? { link: input.variables.headerMediaUrl } : undefined,
    };
    let components;
    try {
      components = buildTemplateSendComponents(summary, values);
    } catch (error) {
      throw ApiError.validation({ formErrors: [(error as Error).message] }, (error as Error).message);
    }
    return {
      dbType: 'template',
      payload: {
        type: 'template',
        template: { name: template.name, language: { code: template.language }, ...(components.length ? { components } : {}) },
      },
      body: renderTemplatePreview(summary, values),
      content: { template: { name: template.name, language: template.language, category: template.category, components } },
      media: null,
      templateId: template.id,
    };
  }

  // Everything else is free-form → only inside the 24h window.
  assertCanSendFreeForm(conversation.expires_at, now);

  switch (input.type) {
    case 'text':
      return {
        dbType: 'text',
        payload: { type: 'text', text: { body: input.text, preview_url: input.previewUrl ?? false } },
        body: input.text,
        content: { text: { body: input.text } },
        media: null,
        templateId: null,
      };
    case 'image':
    case 'video':
    case 'audio':
    case 'document': {
      const ref: MediaRef = input.mediaId ? { id: input.mediaId } : { link: input.mediaUrl as string };
      const caption = input.type === 'audio' ? undefined : input.caption;
      const payload: MessagePayload =
        input.type === 'image'
          ? { type: 'image', image: { ...ref, ...(caption ? { caption } : {}) } }
          : input.type === 'video'
            ? { type: 'video', video: { ...ref, ...(caption ? { caption } : {}) } }
            : input.type === 'audio'
              ? { type: 'audio', audio: ref }
              : { type: 'document', document: { ...ref, ...(caption ? { caption } : {}), ...(input.filename ? { filename: input.filename } : {}) } };
      const label = { image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio', document: `📄 ${input.filename ?? 'Document'}` }[input.type];
      return {
        dbType: input.type,
        payload,
        body: caption || label,
        content: payload as unknown as Record<string, unknown>,
        media: {
          id: input.mediaId ?? null,
          link: input.mediaUrl ?? null,
          mimeType: input.mimeType ?? null,
          filename: input.filename ?? null,
          caption: caption ?? null,
          storagePath: input.storagePath ?? null,
        },
        templateId: null,
      };
    }
    case 'location':
      return {
        dbType: 'location',
        payload: { type: 'location', location: { latitude: input.latitude, longitude: input.longitude, name: input.name, address: input.address } },
        body: `📍 ${input.name ?? 'Location'}`,
        content: { location: { latitude: input.latitude, longitude: input.longitude, name: input.name, address: input.address } },
        media: null,
        templateId: null,
      };
    case 'interactive_buttons':
      return {
        dbType: 'interactive',
        payload: {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: input.body },
            action: { buttons: input.buttons.map((b) => ({ type: 'reply' as const, reply: b })) },
          },
        },
        body: input.body,
        content: { interactive: { type: 'button', body: input.body, buttons: input.buttons } },
        media: null,
        templateId: null,
      };
    case 'interactive_list':
      return {
        dbType: 'interactive',
        payload: {
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: input.body },
            action: { button: input.buttonText, sections: [{ title: input.buttonText.slice(0, 24), rows: input.rows }] },
          },
        },
        body: input.body,
        content: { interactive: { type: 'list', body: input.body, buttonText: input.buttonText, rows: input.rows } },
        media: null,
        templateId: null,
      };
  }
}

/**
 * Sends one outbound message: validates the 24h window / template approval /
 * opt-out, records it (idempotent on clientMessageId), calls the Cloud API
 * and stores the resulting wamid or failure.
 */
export async function sendMessage(input: SendMessageInput, ctx: SendContext, deps: SendDeps): Promise<SentMessage> {
  const now = deps.now?.() ?? new Date();
  const conversation = await deps.store.getConversation(ctx.workspaceId, input.conversationId);
  if (!conversation) throw ApiError.notFound('Conversation not found.');
  if (ctx.plan && deps.store.messagesSentThisMonth) {
    const limit = planLimit(ctx.plan, 'messages_per_month');
    if (Number.isFinite(limit) && (await deps.store.messagesSentThisMonth(ctx.workspaceId)) >= limit) {
      throw new ApiError(403, 'PLAN_LIMIT', `You've sent all ${limit.toLocaleString()} messages included in your plan this month. Upgrade to keep sending.`, {
        limit: 'messages_per_month',
      });
    }
  }

  const prepared = await prepare(input, conversation, ctx, deps, now);
  const replyToWamid = input.replyToMessageId ? await deps.store.getMessageWamid(ctx.workspaceId, input.replyToMessageId) : null;

  const record = await deps.store.recordOutbound({
    workspaceId: ctx.workspaceId,
    conversationId: conversation.id,
    contactId: conversation.contact_id,
    phoneNumberRowId: conversation.phone_number_id,
    type: prepared.dbType,
    senderType: ctx.senderType,
    senderId: ctx.senderId,
    body: prepared.body,
    content: prepared.content,
    media: prepared.media,
    templateId: prepared.templateId,
    clientMessageId: input.clientMessageId ?? null,
    replyToWamid,
  });

  if (record.duplicate && record.status !== 'failed' && record.status !== 'queued') {
    return { id: record.id, conversationId: record.conversation_id, wamid: record.wamid, status: record.status, duplicate: true };
  }

  const { client, metaPhoneNumberId } = await deps.getClient(ctx.workspaceId, conversation.phone_number_id);
  try {
    const result = await client.sendMessage(metaPhoneNumberId, conversation.contact.wa_id, prepared.payload, {
      replyTo: replyToWamid ?? undefined,
    });
    await deps.store.markSent(record.id, result.wamid, ctx.workspaceId);
    return { id: record.id, conversationId: conversation.id, wamid: result.wamid, status: 'sent', duplicate: false };
  } catch (error) {
    if (isWhatsAppApiError(error)) {
      await deps.store.markFailed(record.id, { code: error.code, message: error.friendlyMessage });
      if (error.code !== null && SESSION_WINDOW_ERROR_CODES.has(error.code)) {
        throw ApiError.conflict(error.friendlyMessage, 'SESSION_WINDOW_CLOSED');
      }
      throw new ApiError(502, 'WHATSAPP_ERROR', error.friendlyMessage, { code: error.code, category: error.category });
    }
    await deps.store.markFailed(record.id, { code: null, message: 'Unexpected error while sending' });
    throw error;
  }
}

export { renderCannedReply } from '@/lib/inbox/canned';
