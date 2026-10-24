/**
 * WhatsApp Business Cloud API types (Graph API v21.0).
 * Request shapes follow https://developers.facebook.com/docs/whatsapp/cloud-api
 */

// ---------------------------------------------------------------------------
// Outbound messages
// ---------------------------------------------------------------------------
export type MediaRef = { id: string; link?: never } | { link: string; id?: never };

export interface TextPayload {
  type: 'text';
  text: { body: string; preview_url?: boolean };
}
export interface ImagePayload {
  type: 'image';
  image: MediaRef & { caption?: string };
}
export interface VideoPayload {
  type: 'video';
  video: MediaRef & { caption?: string };
}
export interface AudioPayload {
  type: 'audio';
  audio: MediaRef;
}
export interface DocumentPayload {
  type: 'document';
  document: MediaRef & { caption?: string; filename?: string };
}
export interface StickerPayload {
  type: 'sticker';
  sticker: MediaRef;
}
export interface LocationPayload {
  type: 'location';
  location: { latitude: number; longitude: number; name?: string; address?: string };
}

export interface ContactCard {
  name: { formatted_name: string; first_name?: string; last_name?: string };
  phones?: { phone: string; type?: 'CELL' | 'MAIN' | 'IPHONE' | 'HOME' | 'WORK'; wa_id?: string }[];
  emails?: { email: string; type?: 'HOME' | 'WORK' }[];
  org?: { company?: string; department?: string; title?: string };
  urls?: { url: string; type?: 'HOME' | 'WORK' }[];
}
export interface ContactsPayload {
  type: 'contacts';
  contacts: ContactCard[];
}

export type InteractiveHeader =
  | { type: 'text'; text: string }
  | { type: 'image'; image: MediaRef }
  | { type: 'video'; video: MediaRef }
  | { type: 'document'; document: MediaRef & { filename?: string } };

export interface InteractiveButtonsPayload {
  type: 'interactive';
  interactive: {
    type: 'button';
    header?: InteractiveHeader;
    body: { text: string };
    footer?: { text: string };
    action: { buttons: { type: 'reply'; reply: { id: string; title: string } }[] };
  };
}
export interface InteractiveListPayload {
  type: 'interactive';
  interactive: {
    type: 'list';
    header?: { type: 'text'; text: string };
    body: { text: string };
    footer?: { text: string };
    action: {
      button: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
    };
  };
}
export interface InteractiveCtaPayload {
  type: 'interactive';
  interactive: {
    type: 'cta_url';
    header?: InteractiveHeader;
    body: { text: string };
    footer?: { text: string };
    action: { name: 'cta_url'; parameters: { display_text: string; url: string } };
  };
}

export type TemplateParameter =
  | { type: 'text'; text: string; parameter_name?: string }
  | { type: 'currency'; currency: { fallback_value: string; code: string; amount_1000: number } }
  | { type: 'date_time'; date_time: { fallback_value: string } }
  | { type: 'image'; image: MediaRef }
  | { type: 'video'; video: MediaRef }
  | { type: 'document'; document: MediaRef & { filename?: string } }
  | { type: 'location'; location: { latitude: number; longitude: number; name?: string; address?: string } }
  | { type: 'payload'; payload: string }
  | { type: 'coupon_code'; coupon_code: string };

export type TemplateSendComponent =
  | { type: 'header'; parameters: TemplateParameter[] }
  | { type: 'body'; parameters: TemplateParameter[] }
  | {
      type: 'button';
      sub_type: 'quick_reply' | 'url' | 'copy_code' | 'flow';
      index: string;
      parameters: TemplateParameter[];
    };

export interface TemplatePayload {
  type: 'template';
  template: {
    name: string;
    language: { code: string; policy?: 'deterministic' };
    components?: TemplateSendComponent[];
  };
}
export interface ReactionPayload {
  type: 'reaction';
  reaction: { message_id: string; emoji: string };
}

export type MessagePayload =
  | TextPayload
  | ImagePayload
  | VideoPayload
  | AudioPayload
  | DocumentPayload
  | StickerPayload
  | LocationPayload
  | ContactsPayload
  | InteractiveButtonsPayload
  | InteractiveListPayload
  | InteractiveCtaPayload
  | TemplatePayload
  | ReactionPayload;

export interface SendOptions {
  /** Reply to (quote) a previous message. */
  replyTo?: string;
  /** Opaque string echoed back in status webhooks (max 512 chars). */
  bizOpaqueCallbackData?: string;
  signal?: AbortSignal;
}

export interface SendMessageResponse {
  messaging_product: 'whatsapp';
  contacts: { input: string; wa_id: string }[];
  messages: { id: string; message_status?: 'accepted' | 'held_for_quality_assessment' | 'paused' }[];
}

export interface SendResult {
  wamid: string;
  waId: string | null;
  messageStatus: string | null;
  raw: SendMessageResponse;
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------
export interface MediaInfo {
  id: string;
  url: string;
  mime_type: string;
  sha256: string;
  file_size: number;
  messaging_product: 'whatsapp';
}

// ---------------------------------------------------------------------------
// Templates (management API)
// ---------------------------------------------------------------------------
export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
export type TemplateStatus =
  | 'APPROVED'
  | 'PENDING'
  | 'REJECTED'
  | 'PAUSED'
  | 'DISABLED'
  | 'IN_APPEAL'
  | 'PENDING_DELETION'
  | 'DELETED'
  | 'LIMIT_EXCEEDED'
  | 'ARCHIVED';

export type TemplateButtonDefinition =
  | { type: 'QUICK_REPLY'; text: string }
  | { type: 'URL'; text: string; url: string; example?: string[] }
  | { type: 'PHONE_NUMBER'; text: string; phone_number: string }
  | { type: 'COPY_CODE'; example: string }
  | { type: 'OTP'; otp_type: 'COPY_CODE' | 'ONE_TAP' | 'ZERO_TAP'; text?: string };

export type TemplateComponentDefinition =
  | { type: 'HEADER'; format: 'TEXT'; text: string; example?: { header_text: string[] } }
  | { type: 'HEADER'; format: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; example?: { header_handle: string[] } }
  | { type: 'HEADER'; format: 'LOCATION' }
  | { type: 'BODY'; text: string; example?: { body_text: string[][] }; add_security_recommendation?: boolean }
  | { type: 'FOOTER'; text: string; code_expiration_minutes?: number }
  | { type: 'BUTTONS'; buttons: TemplateButtonDefinition[] };

export interface CreateTemplateInput {
  name: string;
  language: string;
  category: TemplateCategory;
  components: TemplateComponentDefinition[];
  parameter_format?: 'POSITIONAL' | 'NAMED';
  allow_category_change?: boolean;
}

export interface CreateTemplateResponse {
  id: string;
  status: TemplateStatus;
  category: TemplateCategory;
}

export interface TemplateInfo {
  id: string;
  name: string;
  language: string;
  status: TemplateStatus | string;
  category: TemplateCategory | string;
  components?: TemplateComponentDefinition[];
  rejected_reason?: string;
  quality_score?: { score: string; date?: number };
  parameter_format?: 'POSITIONAL' | 'NAMED';
}

export interface Paged<T> {
  data: T[];
  paging?: { cursors?: { before?: string; after?: string }; next?: string; previous?: string };
}

// ---------------------------------------------------------------------------
// Phone numbers & WABA
// ---------------------------------------------------------------------------
export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN' | 'NA';
export type MessagingTier = 'TIER_50' | 'TIER_250' | 'TIER_1K' | 'TIER_10K' | 'TIER_100K' | 'TIER_UNLIMITED';

export interface PhoneNumberInfo {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating?: QualityRating | string;
  code_verification_status?: string;
  name_status?: string;
  new_name_status?: string;
  messaging_limit_tier?: MessagingTier | string;
  throughput?: { level: string };
  status?: string;
  platform_type?: string;
  is_official_business_account?: boolean;
  account_mode?: string;
}

export interface WabaInfo {
  id: string;
  name?: string;
  currency?: string;
  timezone_id?: string;
  message_template_namespace?: string;
  account_review_status?: string;
  business_verification_status?: string;
  owner_business_info?: { id: string; name: string };
}

export interface BusinessProfile {
  about?: string;
  address?: string;
  description?: string;
  email?: string;
  profile_picture_handle?: string;
  vertical?:
    | 'UNDEFINED'
    | 'OTHER'
    | 'AUTO'
    | 'BEAUTY'
    | 'APPAREL'
    | 'EDU'
    | 'ENTERTAIN'
    | 'EVENT_PLAN'
    | 'FINANCE'
    | 'GROCERY'
    | 'GOVT'
    | 'HOTEL'
    | 'HEALTH'
    | 'NONPROFIT'
    | 'PROF_SERVICES'
    | 'RETAIL'
    | 'TRAVEL'
    | 'RESTAURANT'
    | 'NOT_A_BIZ';
  websites?: string[];
}

export interface SuccessResponse {
  success: boolean;
}

// ---------------------------------------------------------------------------
// OAuth / Embedded Signup
// ---------------------------------------------------------------------------
export interface TokenExchangeResult {
  accessToken: string;
  tokenType: string;
  /** Seconds; undefined for non-expiring Business Integration System User tokens. */
  expiresIn?: number;
}

export interface DebugTokenResult {
  appId: string | null;
  isValid: boolean;
  userId: string | null;
  expiresAt: Date | null;
  scopes: string[];
  granularScopes: { scope: string; targetIds: string[] }[];
}
