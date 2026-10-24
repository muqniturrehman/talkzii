import { createHmac, timingSafeEqual } from 'node:crypto';

// ---------------------------------------------------------------------------
// Signature + verification handshake
// ---------------------------------------------------------------------------

/** `sha256=<hex>` HMAC of the raw request body with the Meta app secret. */
export function computeWebhookSignature(rawBody: string | Uint8Array, appSecret: string): string {
  return `sha256=${createHmac('sha256', appSecret).update(rawBody).digest('hex')}`;
}

/**
 * Verifies `X-Hub-Signature-256`. Always pass the exact raw body (before JSON
 * parsing) — re-serialising changes bytes and breaks the signature.
 */
export function verifyWebhookSignature(
  rawBody: string | Uint8Array,
  signatureHeader: string | null | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !appSecret) return false;
  const [scheme, received] = signatureHeader.trim().split('=');
  if (scheme !== 'sha256' || !received || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const provided = Buffer.from(received, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/** GET verification handshake: returns hub.challenge when the token matches. */
export function verifyWebhookChallenge(params: URLSearchParams, verifyToken: string): string | null {
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token') ?? '';
  const challenge = params.get('hub.challenge');
  if (mode !== 'subscribe' || !challenge || !verifyToken) return null;
  const a = Buffer.from(token);
  const b = Buffer.from(verifyToken);
  return a.length === b.length && timingSafeEqual(a, b) ? challenge : null;
}

// ---------------------------------------------------------------------------
// Raw payload types (subset we consume)
// ---------------------------------------------------------------------------
export interface WebhookPayload {
  object: string;
  entry: { id: string; time?: number; changes: { field: string; value: unknown }[] }[];
}

export interface RawWebhookError {
  code: number;
  title?: string;
  message?: string;
  error_data?: { details?: string };
}

interface RawMedia {
  id: string;
  mime_type?: string;
  sha256?: string;
  caption?: string;
  filename?: string;
  voice?: boolean;
  animated?: boolean;
}

export interface RawWebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: RawMedia;
  video?: RawMedia;
  audio?: RawMedia;
  document?: RawMedia;
  sticker?: RawMedia;
  location?: { latitude: number; longitude: number; name?: string; address?: string; url?: string };
  contacts?: unknown[];
  interactive?: {
    type: 'button_reply' | 'list_reply' | 'nfm_reply' | string;
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
    nfm_reply?: { response_json: string; body?: string; name?: string };
  };
  button?: { payload: string; text: string };
  reaction?: { message_id: string; emoji?: string };
  order?: { catalog_id: string; text?: string; product_items?: unknown[] };
  system?: { body?: string; type?: string; new_wa_id?: string; wa_id?: string };
  referral?: {
    source_url?: string;
    source_type?: string;
    source_id?: string;
    headline?: string;
    body?: string;
    media_type?: string;
    ctwa_clid?: string;
  };
  context?: { from?: string; id?: string; forwarded?: boolean; frequently_forwarded?: boolean };
  errors?: RawWebhookError[];
}

interface RawStatus {
  id: string;
  status: string;
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type?: string } };
  pricing?: { billable?: boolean; pricing_model?: string; category?: string; type?: string };
  errors?: RawWebhookError[];
  biz_opaque_callback_data?: string;
}

interface MessagesValue {
  messaging_product?: string;
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  contacts?: { profile?: { name?: string }; wa_id: string }[];
  messages?: RawWebhookMessage[];
  statuses?: RawStatus[];
  errors?: RawWebhookError[];
}

// ---------------------------------------------------------------------------
// Normalised events
// ---------------------------------------------------------------------------
export type InboundMessageType =
  | 'text'
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'sticker'
  | 'location'
  | 'contacts'
  | 'interactive'
  | 'button'
  | 'reaction'
  | 'order'
  | 'system'
  | 'unsupported';

export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';
export type DeliveryStatus = 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';

export interface InboundMedia {
  id: string;
  mimeType: string | null;
  sha256: string | null;
  caption: string | null;
  filename: string | null;
  voice: boolean;
  animated: boolean;
}

export interface NormalizedMessage {
  wamid: string;
  from: string;
  timestamp: Date;
  type: InboundMessageType;
  rawType: string;
  /** Searchable / previewable text: body, caption, button title, emoji… */
  text: string | null;
  media: InboundMedia | null;
  location: { latitude: number; longitude: number; name: string | null; address: string | null } | null;
  interactive: { kind: string; id: string; title: string; description: string | null; responseJson: string | null } | null;
  button: { payload: string; text: string } | null;
  reaction: { messageId: string; emoji: string | null } | null;
  referral: RawWebhookMessage['referral'] | null;
  context: { from: string | null; id: string | null; forwarded: boolean } | null;
  errors: RawWebhookError[];
  raw: RawWebhookMessage;
}

export interface NormalizedStatus {
  wamid: string;
  status: DeliveryStatus;
  timestamp: Date;
  recipientId: string;
  conversation: { id: string; category: PricingCategory | null; expiresAt: Date | null } | null;
  pricing: { billable: boolean | null; model: string | null; category: PricingCategory | null; type: string | null } | null;
  errors: RawWebhookError[];
  bizOpaqueCallbackData: string | null;
}

export type NormalizedWebhookEvent =
  | {
      kind: 'message';
      wabaId: string;
      phoneNumberId: string;
      displayPhoneNumber: string | null;
      contact: { waId: string; profileName: string | null };
      message: NormalizedMessage;
    }
  | { kind: 'status'; wabaId: string; phoneNumberId: string; status: NormalizedStatus }
  | {
      kind: 'template_status';
      wabaId: string;
      templateId: string;
      name: string | null;
      language: string | null;
      event: string;
      reason: string | null;
    }
  | {
      kind: 'template_quality';
      wabaId: string;
      templateId: string;
      name: string | null;
      language: string | null;
      previousScore: string | null;
      newScore: string | null;
    }
  | {
      kind: 'template_category';
      wabaId: string;
      templateId: string;
      name: string | null;
      language: string | null;
      previousCategory: string | null;
      newCategory: string | null;
    }
  | {
      kind: 'phone_quality';
      wabaId: string;
      displayPhoneNumber: string;
      event: string;
      currentLimit: string | null;
      oldLimit: string | null;
    }
  | {
      kind: 'phone_name';
      wabaId: string;
      displayPhoneNumber: string;
      decision: string;
      requestedName: string | null;
      rejectionReason: string | null;
    }
  | { kind: 'account_review'; wabaId: string; decision: string }
  | {
      kind: 'account_update';
      wabaId: string;
      event: string;
      phoneNumber: string | null;
      details: Record<string, unknown>;
    }
  | {
      kind: 'business_capability';
      wabaId: string;
      maxDailyConversationsPerPhone: number | null;
      maxPhoneNumbersPerBusiness: number | null;
      maxPhoneNumbersPerWaba: number | null;
    }
  | { kind: 'error'; wabaId: string; phoneNumberId: string | null; errors: RawWebhookError[] }
  | { kind: 'unknown'; wabaId: string; field: string; value: unknown };

const MESSAGE_TYPES = new Set<InboundMessageType>([
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'interactive',
  'button',
  'reaction',
  'order',
  'system',
]);

export function toPricingCategory(value: string | null | undefined): PricingCategory | null {
  if (!value) return null;
  const v = value.toLowerCase();
  if (v.startsWith('marketing')) return 'marketing';
  if (v.startsWith('utility')) return 'utility';
  if (v.startsWith('authentication')) return 'authentication';
  if (v === 'service' || v === 'referral_conversion' || v === 'free_entry_point') return 'service';
  return null;
}

function toDate(unixSeconds: string | number | undefined): Date {
  const n = Number(unixSeconds);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000) : new Date();
}

function mediaOf(raw: RawWebhookMessage): InboundMedia | null {
  const media = raw.image ?? raw.video ?? raw.audio ?? raw.document ?? raw.sticker;
  if (!media?.id) return null;
  return {
    id: media.id,
    mimeType: media.mime_type ?? null,
    sha256: media.sha256 ?? null,
    caption: media.caption ?? null,
    filename: media.filename ?? null,
    voice: Boolean(media.voice),
    animated: Boolean(media.animated),
  };
}

/** Short human-readable preview for conversation lists and notifications. */
export function messagePreviewText(message: Pick<NormalizedMessage, 'type' | 'text' | 'media' | 'location' | 'reaction'>): string {
  switch (message.type) {
    case 'text':
      return message.text ?? '';
    case 'image':
      return message.media?.caption ? `📷 ${message.media.caption}` : '📷 Photo';
    case 'video':
      return message.media?.caption ? `🎥 ${message.media.caption}` : '🎥 Video';
    case 'audio':
      return message.media?.voice ? '🎤 Voice message' : '🎵 Audio';
    case 'document':
      return `📄 ${message.media?.filename ?? message.media?.caption ?? 'Document'}`;
    case 'sticker':
      return '💟 Sticker';
    case 'location':
      return `📍 ${message.location?.name ?? 'Location'}`;
    case 'contacts':
      return '👤 Contact card';
    case 'reaction':
      return message.reaction?.emoji ? `Reacted ${message.reaction.emoji}` : 'Removed a reaction';
    case 'order':
      return '🛒 New order';
    case 'interactive':
    case 'button':
    case 'system':
      return message.text ?? '';
    default:
      return 'Unsupported message';
  }
}

export function normalizeMessage(raw: RawWebhookMessage): NormalizedMessage {
  const type: InboundMessageType = MESSAGE_TYPES.has(raw.type as InboundMessageType)
    ? (raw.type as InboundMessageType)
    : raw.type === 'request_welcome'
      ? 'system'
      : 'unsupported';
  const media = mediaOf(raw);
  const interactiveReply = raw.interactive?.button_reply ?? raw.interactive?.list_reply;

  let text: string | null = null;
  if (raw.text?.body) text = raw.text.body;
  else if (media?.caption) text = media.caption;
  else if (interactiveReply) text = interactiveReply.title;
  else if (raw.interactive?.nfm_reply) text = raw.interactive.nfm_reply.body ?? 'Form submitted';
  else if (raw.button) text = raw.button.text;
  else if (raw.reaction) text = raw.reaction.emoji ?? null;
  else if (raw.system?.body) text = raw.system.body;
  else if (raw.order?.text) text = raw.order.text;
  else if (raw.location) text = raw.location.name ?? raw.location.address ?? null;

  return {
    wamid: raw.id,
    from: raw.from,
    timestamp: toDate(raw.timestamp),
    type,
    rawType: raw.type,
    text,
    media,
    location: raw.location
      ? {
          latitude: raw.location.latitude,
          longitude: raw.location.longitude,
          name: raw.location.name ?? null,
          address: raw.location.address ?? null,
        }
      : null,
    interactive: raw.interactive
      ? {
          kind: raw.interactive.type,
          id: interactiveReply?.id ?? raw.interactive.nfm_reply?.name ?? '',
          title: interactiveReply?.title ?? raw.interactive.nfm_reply?.body ?? '',
          description: raw.interactive.list_reply?.description ?? null,
          responseJson: raw.interactive.nfm_reply?.response_json ?? null,
        }
      : null,
    button: raw.button ? { payload: raw.button.payload, text: raw.button.text } : null,
    reaction: raw.reaction ? { messageId: raw.reaction.message_id, emoji: raw.reaction.emoji || null } : null,
    referral: raw.referral ?? null,
    context: raw.context
      ? { from: raw.context.from ?? null, id: raw.context.id ?? null, forwarded: Boolean(raw.context.forwarded) }
      : null,
    errors: raw.errors ?? [],
    raw,
  };
}

function normalizeStatus(raw: RawStatus): NormalizedStatus | null {
  const allowed: DeliveryStatus[] = ['sent', 'delivered', 'read', 'failed', 'deleted'];
  if (!allowed.includes(raw.status as DeliveryStatus)) return null;
  const pricingCategory = toPricingCategory(raw.pricing?.category);
  return {
    wamid: raw.id,
    status: raw.status as DeliveryStatus,
    timestamp: toDate(raw.timestamp),
    recipientId: raw.recipient_id,
    conversation: raw.conversation
      ? {
          id: raw.conversation.id,
          category: toPricingCategory(raw.conversation.origin?.type) ?? pricingCategory,
          expiresAt: raw.conversation.expiration_timestamp ? toDate(raw.conversation.expiration_timestamp) : null,
        }
      : null,
    pricing: raw.pricing
      ? {
          billable: typeof raw.pricing.billable === 'boolean' ? raw.pricing.billable : null,
          model: raw.pricing.pricing_model ?? null,
          category: pricingCategory,
          type: raw.pricing.type ?? null,
        }
      : null,
    errors: raw.errors ?? [],
    bizOpaqueCallbackData: raw.biz_opaque_callback_data ?? null,
  };
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : typeof v === 'string' && v !== '' ? Number(v) : null);

/**
 * Flattens a Meta webhook payload into typed events. Unknown fields are kept
 * as `unknown` events so nothing is silently dropped.
 */
export function parseWebhookPayload(payload: unknown): NormalizedWebhookEvent[] {
  const body = payload as WebhookPayload | null;
  if (!body || body.object !== 'whatsapp_business_account' || !Array.isArray(body.entry)) return [];
  const events: NormalizedWebhookEvent[] = [];

  for (const entry of body.entry) {
    const wabaId = String(entry.id);
    for (const change of entry.changes ?? []) {
      const value = (change.value ?? {}) as Record<string, unknown>;
      switch (change.field) {
        case 'messages': {
          const v = value as MessagesValue;
          const phoneNumberId = v.metadata?.phone_number_id ?? '';
          const displayPhoneNumber = v.metadata?.display_phone_number ?? null;
          for (const raw of v.messages ?? []) {
            const contact = v.contacts?.find((c) => c.wa_id === raw.from) ?? v.contacts?.[0];
            events.push({
              kind: 'message',
              wabaId,
              phoneNumberId,
              displayPhoneNumber,
              contact: { waId: contact?.wa_id ?? raw.from, profileName: contact?.profile?.name ?? null },
              message: normalizeMessage(raw),
            });
          }
          for (const raw of v.statuses ?? []) {
            const status = normalizeStatus(raw);
            if (status) events.push({ kind: 'status', wabaId, phoneNumberId, status });
          }
          if (v.errors?.length) events.push({ kind: 'error', wabaId, phoneNumberId: phoneNumberId || null, errors: v.errors });
          break;
        }
        case 'message_template_status_update':
          events.push({
            kind: 'template_status',
            wabaId,
            templateId: str(value.message_template_id) ?? '',
            name: str(value.message_template_name),
            language: str(value.message_template_language),
            event: str(value.event) ?? 'UNKNOWN',
            reason: str(value.reason) === 'NONE' ? null : str(value.reason),
          });
          break;
        case 'message_template_quality_update':
          events.push({
            kind: 'template_quality',
            wabaId,
            templateId: str(value.message_template_id) ?? '',
            name: str(value.message_template_name),
            language: str(value.message_template_language),
            previousScore: str(value.previous_quality_score),
            newScore: str(value.new_quality_score),
          });
          break;
        case 'template_category_update':
          events.push({
            kind: 'template_category',
            wabaId,
            templateId: str(value.message_template_id) ?? '',
            name: str(value.message_template_name),
            language: str(value.message_template_language),
            previousCategory: str(value.previous_category),
            newCategory: str(value.new_category),
          });
          break;
        case 'phone_number_quality_update':
          events.push({
            kind: 'phone_quality',
            wabaId,
            displayPhoneNumber: str(value.display_phone_number) ?? '',
            event: str(value.event) ?? 'UNKNOWN',
            currentLimit: str(value.current_limit),
            oldLimit: str(value.old_limit),
          });
          break;
        case 'phone_number_name_update':
          events.push({
            kind: 'phone_name',
            wabaId,
            displayPhoneNumber: str(value.display_phone_number) ?? '',
            decision: str(value.decision) ?? 'UNKNOWN',
            requestedName: str(value.requested_verified_name),
            rejectionReason: str(value.rejection_reason) === 'NONE' ? null : str(value.rejection_reason),
          });
          break;
        case 'account_review_update':
          events.push({ kind: 'account_review', wabaId, decision: str(value.decision) ?? 'UNKNOWN' });
          break;
        case 'account_update': {
          const { event, phone_number: phoneNumber, ...details } = value;
          events.push({
            kind: 'account_update',
            wabaId,
            event: str(event) ?? 'UNKNOWN',
            phoneNumber: str(phoneNumber),
            details,
          });
          break;
        }
        case 'business_capability_update':
          events.push({
            kind: 'business_capability',
            wabaId,
            maxDailyConversationsPerPhone: num(value.max_daily_conversation_per_phone),
            maxPhoneNumbersPerBusiness: num(value.max_phone_numbers_per_business),
            maxPhoneNumbersPerWaba: num(value.max_phone_numbers_per_waba),
          });
          break;
        default:
          events.push({ kind: 'unknown', wabaId, field: change.field, value: change.value });
      }
    }
  }
  return events;
}

/** Digits-only form of a display phone number (for matching "+92 300 …"). */
export function digitsOnly(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}
