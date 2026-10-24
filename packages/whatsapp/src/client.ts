import { createHmac } from 'node:crypto';
import { networkError, normalizeGraphError, WhatsAppApiError } from './errors';
import { backoffDelay, DEFAULT_RETRY, parseRetryAfter, sleep, type RetryOptions } from './retry';
import type {
  BusinessProfile,
  ContactCard,
  CreateTemplateInput,
  CreateTemplateResponse,
  DebugTokenResult,
  InteractiveHeader,
  MediaInfo,
  MediaRef,
  MessagePayload,
  Paged,
  PhoneNumberInfo,
  SendMessageResponse,
  SendOptions,
  SendResult,
  SuccessResponse,
  TemplateInfo,
  TemplateSendComponent,
  TokenExchangeResult,
  WabaInfo,
} from './types';

export const GRAPH_API_BASE_URL = 'https://graph.facebook.com';
export const DEFAULT_GRAPH_API_VERSION = 'v21.0';

type HttpMethod = 'GET' | 'POST' | 'DELETE';
type QueryValue = string | number | boolean | undefined | null;

export interface GraphTransportOptions {
  apiVersion?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  retry?: Partial<RetryOptions>;
  /** Per-attempt timeout (default 15s). */
  timeoutMs?: number;
  /** Injected for deterministic tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface WhatsAppClientOptions extends GraphTransportOptions {
  accessToken: string;
  /** When set, every call carries appsecret_proof (recommended by Meta). */
  appSecret?: string;
}

interface RequestOptions {
  query?: Record<string, QueryValue>;
  json?: unknown;
  form?: FormData;
  /** Raw bytes (Resumable Upload API). */
  rawBody?: ArrayBuffer;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Override retries for this call (e.g. 0 for non-idempotent operations). */
  retries?: number;
  responseType?: 'json' | 'arrayBuffer';
  /** Absolute URL (media downloads) instead of a Graph path. */
  absoluteUrl?: string;
}

/** Connection-level failures that guarantee the request never reached Meta. */
const PRE_CONNECT_CODES = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'UND_ERR_CONNECT_TIMEOUT']);

function causeCode(error: unknown): string | undefined {
  const cause = (error as { cause?: { code?: string } } | null)?.cause;
  return cause?.code ?? (error as { code?: string } | null)?.code;
}

/**
 * Low-level Graph API transport: auth header, appsecret_proof, timeouts and
 * retries with exponential backoff on 429 / 5xx / transient WhatsApp codes.
 */
export class GraphTransport {
  protected readonly baseUrl: string;
  protected readonly apiVersion: string;
  protected readonly retry: RetryOptions;
  protected readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleepImpl: (ms: number, signal?: AbortSignal) => Promise<void>;

  constructor(options: GraphTransportOptions = {}) {
    this.baseUrl = (options.baseUrl ?? GRAPH_API_BASE_URL).replace(/\/$/, '');
    this.apiVersion = options.apiVersion ?? DEFAULT_GRAPH_API_VERSION;
    this.retry = { ...DEFAULT_RETRY, ...options.retry };
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.fetchImpl = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.sleepImpl = options.sleep ?? sleep;
  }

  protected url(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}/${this.apiVersion}/${path.replace(/^\//, '')}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    return url.toString();
  }

  async request<T>(method: HttpMethod, path: string, options: RequestOptions = {}, token?: string): Promise<T> {
    const url = options.absoluteUrl ?? this.url(path, options.query);
    const headers: Record<string, string> = { ...options.headers };
    if (token) headers.Authorization = `Bearer ${token}`;
    let body: BodyInit | undefined;
    if (options.json !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.json);
    } else if (options.form) {
      body = options.form;
    } else if (options.rawBody) {
      body = options.rawBody;
    }

    const retries = options.retries ?? this.retry.retries;
    const idempotent = method === 'GET' || method === 'DELETE';

    for (let attempt = 0; ; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
      const onAbort = () => controller.abort(options.signal?.reason);
      options.signal?.addEventListener('abort', onAbort, { once: true });

      let response: Response;
      try {
        response = await this.fetchImpl(url, { method, headers, body, signal: controller.signal });
      } catch (error) {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', onAbort);
        if (options.signal?.aborted) throw error;
        const timedOut = controller.signal.aborted;
        const safeToRetry = idempotent || (!timedOut && PRE_CONNECT_CODES.has(causeCode(error) ?? ''));
        if (attempt < retries && safeToRetry) {
          await this.sleepImpl(backoffDelay(attempt, this.retry), options.signal);
          continue;
        }
        throw networkError(error, timedOut);
      }
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);

      if (response.ok) {
        if (options.responseType === 'arrayBuffer') return (await response.arrayBuffer()) as T;
        const text = await response.text();
        return (text ? JSON.parse(text) : {}) as T;
      }

      const text = await response.text().catch(() => '');
      let parsed: unknown = text;
      try {
        parsed = text ? JSON.parse(text) : {};
      } catch {
        // keep raw text
      }
      const error = normalizeGraphError(response.status, parsed);
      if (error.retryable && attempt < retries) {
        const retryAfter = parseRetryAfter(response.headers.get('retry-after'));
        const delay = Math.min(retryAfter ?? backoffDelay(attempt, this.retry), this.retry.maxDelayMs);
        await this.sleepImpl(delay, options.signal);
        continue;
      }
      throw error;
    }
  }
}

function validationError(message: string): WhatsAppApiError {
  return new WhatsAppApiError({ message, status: 400, category: 'invalid_request', retryable: false, raw: { local: true } });
}

/** Strips "+", spaces and dashes: Cloud API recipients are digits only. */
export function toRecipient(phone: string): string {
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 6 || digits.length > 15) throw validationError(`Invalid WhatsApp number: ${phone}`);
  return digits;
}

const PHONE_FIELDS =
  'id,display_phone_number,verified_name,quality_rating,code_verification_status,name_status,new_name_status,messaging_limit_tier,throughput,status,platform_type,is_official_business_account,account_mode';
const TEMPLATE_FIELDS = 'id,name,language,status,category,components,rejected_reason,quality_score,parameter_format';
const WABA_FIELDS =
  'id,name,currency,timezone_id,message_template_namespace,account_review_status,business_verification_status,owner_business_info';

/**
 * Typed WhatsApp Business Cloud API client bound to one access token
 * (the Business Integration System User token from Embedded Signup).
 */
export class WhatsAppClient extends GraphTransport {
  private readonly accessToken: string;
  private readonly appSecretProof: string | undefined;

  constructor(options: WhatsAppClientOptions) {
    super(options);
    if (!options.accessToken) throw new Error('WhatsAppClient requires an accessToken');
    this.accessToken = options.accessToken;
    this.appSecretProof = options.appSecret
      ? createHmac('sha256', options.appSecret).update(options.accessToken).digest('hex')
      : undefined;
  }

  private call<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
    const query = this.appSecretProof ? { ...options.query, appsecret_proof: this.appSecretProof } : options.query;
    return this.request<T>(method, path, { ...options, query }, this.accessToken);
  }

  // -------------------------------------------------------------------------
  // Messages
  // -------------------------------------------------------------------------
  async sendMessage(phoneNumberId: string, to: string, payload: MessagePayload, options: SendOptions = {}): Promise<SendResult> {
    const json = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toRecipient(to),
      ...(options.replyTo ? { context: { message_id: options.replyTo } } : {}),
      ...(options.bizOpaqueCallbackData ? { biz_opaque_callback_data: options.bizOpaqueCallbackData.slice(0, 512) } : {}),
      ...payload,
    };
    const raw = await this.call<SendMessageResponse>('POST', `${phoneNumberId}/messages`, { json, signal: options.signal });
    const message = raw.messages?.[0];
    if (!message?.id) throw new WhatsAppApiError({ message: 'Cloud API did not return a message id', status: 502, category: 'server', retryable: false, raw });
    return { wamid: message.id, waId: raw.contacts?.[0]?.wa_id ?? null, messageStatus: message.message_status ?? null, raw };
  }

  async sendText(phoneNumberId: string, to: string, text: string, options: SendOptions & { previewUrl?: boolean } = {}) {
    if (!text.trim()) throw validationError('Message text is empty');
    if (text.length > 4096) throw validationError('Text messages are limited to 4096 characters');
    return this.sendMessage(phoneNumberId, to, { type: 'text', text: { body: text, preview_url: options.previewUrl ?? false } }, options);
  }

  async sendTemplate(
    phoneNumberId: string,
    to: string,
    template: { name: string; language: string; components?: TemplateSendComponent[] },
    options: SendOptions = {},
  ) {
    return this.sendMessage(
      phoneNumberId,
      to,
      {
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language },
          ...(template.components?.length ? { components: template.components } : {}),
        },
      },
      options,
    );
  }

  async sendImage(phoneNumberId: string, to: string, media: MediaRef, options: SendOptions & { caption?: string } = {}) {
    return this.sendMessage(phoneNumberId, to, { type: 'image', image: { ...media, ...(options.caption ? { caption: options.caption } : {}) } }, options);
  }

  async sendVideo(phoneNumberId: string, to: string, media: MediaRef, options: SendOptions & { caption?: string } = {}) {
    return this.sendMessage(phoneNumberId, to, { type: 'video', video: { ...media, ...(options.caption ? { caption: options.caption } : {}) } }, options);
  }

  async sendAudio(phoneNumberId: string, to: string, media: MediaRef, options: SendOptions = {}) {
    return this.sendMessage(phoneNumberId, to, { type: 'audio', audio: media }, options);
  }

  async sendDocument(phoneNumberId: string, to: string, media: MediaRef, options: SendOptions & { caption?: string; filename?: string } = {}) {
    return this.sendMessage(
      phoneNumberId,
      to,
      {
        type: 'document',
        document: {
          ...media,
          ...(options.caption ? { caption: options.caption } : {}),
          ...(options.filename ? { filename: options.filename } : {}),
        },
      },
      options,
    );
  }

  async sendLocation(
    phoneNumberId: string,
    to: string,
    location: { latitude: number; longitude: number; name?: string; address?: string },
    options: SendOptions = {},
  ) {
    if (Math.abs(location.latitude) > 90 || Math.abs(location.longitude) > 180) throw validationError('Invalid coordinates');
    return this.sendMessage(phoneNumberId, to, { type: 'location', location }, options);
  }

  async sendContacts(phoneNumberId: string, to: string, contacts: ContactCard[], options: SendOptions = {}) {
    if (contacts.length === 0) throw validationError('At least one contact card is required');
    return this.sendMessage(phoneNumberId, to, { type: 'contacts', contacts }, options);
  }

  async sendInteractiveButtons(
    phoneNumberId: string,
    to: string,
    input: { body: string; buttons: { id: string; title: string }[]; header?: InteractiveHeader; footer?: string },
    options: SendOptions = {},
  ) {
    if (input.buttons.length < 1 || input.buttons.length > 3) throw validationError('Reply buttons: 1 to 3 buttons');
    for (const b of input.buttons) {
      if (b.title.length > 20) throw validationError(`Button title "${b.title}" exceeds 20 characters`);
      if (b.id.length > 256) throw validationError('Button id exceeds 256 characters');
    }
    if (input.body.length > 1024) throw validationError('Interactive body exceeds 1024 characters');
    return this.sendMessage(
      phoneNumberId,
      to,
      {
        type: 'interactive',
        interactive: {
          type: 'button',
          ...(input.header ? { header: input.header } : {}),
          body: { text: input.body },
          ...(input.footer ? { footer: { text: input.footer } } : {}),
          action: { buttons: input.buttons.map((b) => ({ type: 'reply' as const, reply: { id: b.id, title: b.title } })) },
        },
      },
      options,
    );
  }

  async sendInteractiveList(
    phoneNumberId: string,
    to: string,
    input: {
      body: string;
      buttonText: string;
      sections: { title?: string; rows: { id: string; title: string; description?: string }[] }[];
      header?: string;
      footer?: string;
    },
    options: SendOptions = {},
  ) {
    const rows = input.sections.flatMap((s) => s.rows);
    if (rows.length < 1 || rows.length > 10) throw validationError('List messages support 1 to 10 rows in total');
    if (input.sections.length > 10) throw validationError('List messages support at most 10 sections');
    if (input.buttonText.length > 20) throw validationError('List button text exceeds 20 characters');
    for (const row of rows) {
      if (row.title.length > 24) throw validationError(`Row title "${row.title}" exceeds 24 characters`);
      if (row.description && row.description.length > 72) throw validationError('Row description exceeds 72 characters');
    }
    return this.sendMessage(
      phoneNumberId,
      to,
      {
        type: 'interactive',
        interactive: {
          type: 'list',
          ...(input.header ? { header: { type: 'text' as const, text: input.header } } : {}),
          body: { text: input.body },
          ...(input.footer ? { footer: { text: input.footer } } : {}),
          action: { button: input.buttonText, sections: input.sections },
        },
      },
      options,
    );
  }

  async sendInteractiveCta(
    phoneNumberId: string,
    to: string,
    input: { body: string; displayText: string; url: string; header?: InteractiveHeader; footer?: string },
    options: SendOptions = {},
  ) {
    if (input.displayText.length > 20) throw validationError('CTA button text exceeds 20 characters');
    if (!/^https?:\/\//i.test(input.url)) throw validationError('CTA URL must start with http(s)://');
    return this.sendMessage(
      phoneNumberId,
      to,
      {
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          ...(input.header ? { header: input.header } : {}),
          body: { text: input.body },
          ...(input.footer ? { footer: { text: input.footer } } : {}),
          action: { name: 'cta_url', parameters: { display_text: input.displayText, url: input.url } },
        },
      },
      options,
    );
  }

  async sendReaction(phoneNumberId: string, to: string, messageId: string, emoji: string, options: SendOptions = {}) {
    return this.sendMessage(phoneNumberId, to, { type: 'reaction', reaction: { message_id: messageId, emoji } }, options);
  }

  /** Marks an inbound message as read (blue ticks); optionally shows a typing indicator. */
  async markAsRead(phoneNumberId: string, messageId: string, options: { typingIndicator?: boolean; signal?: AbortSignal } = {}) {
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/messages`, {
      json: {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        ...(options.typingIndicator ? { typing_indicator: { type: 'text' } } : {}),
      },
      signal: options.signal,
    });
  }

  // -------------------------------------------------------------------------
  // Media
  // -------------------------------------------------------------------------
  async uploadMedia(
    phoneNumberId: string,
    file: Blob,
    options: { filename: string; mimeType?: string; signal?: AbortSignal },
  ): Promise<{ id: string }> {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', options.mimeType ?? file.type ?? 'application/octet-stream');
    form.append('file', file, options.filename);
    return this.call<{ id: string }>('POST', `${phoneNumberId}/media`, { form, signal: options.signal });
  }

  /** Resolves a media id to a short-lived download URL (valid ~5 minutes). */
  async getMediaUrl(mediaId: string, options: { phoneNumberId?: string; signal?: AbortSignal } = {}) {
    return this.call<MediaInfo>('GET', mediaId, {
      query: options.phoneNumberId ? { phone_number_id: options.phoneNumberId } : undefined,
      signal: options.signal,
    });
  }

  /** Downloads media bytes from a URL returned by getMediaUrl (requires the token). */
  async downloadMedia(url: string, options: { signal?: AbortSignal } = {}): Promise<ArrayBuffer> {
    if (!/^https:\/\//.test(url)) throw validationError('Media URL must be https');
    return this.request<ArrayBuffer>('GET', '', { absoluteUrl: url, responseType: 'arrayBuffer', signal: options.signal }, this.accessToken);
  }

  async deleteMedia(mediaId: string) {
    return this.call<SuccessResponse>('DELETE', mediaId);
  }

  /**
   * Resumable Upload API → `header_handle` used as the sample for media
   * template headers. Requires the Meta app id.
   */
  async uploadTemplateExample(appId: string, file: Blob, options: { filename: string; mimeType: string }): Promise<string> {
    const session = await this.call<{ id: string }>('POST', `${appId}/uploads`, {
      query: { file_length: file.size, file_type: options.mimeType, file_name: options.filename },
    });
    const result = await this.request<{ h: string }>('POST', session.id, {
      rawBody: await file.arrayBuffer(),
      headers: { file_offset: '0', Authorization: `OAuth ${this.accessToken}` },
      retries: 0,
    });
    return result.h;
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------
  async createTemplate(wabaId: string, input: CreateTemplateInput) {
    return this.call<CreateTemplateResponse>('POST', `${wabaId}/message_templates`, { json: input, retries: 1 });
  }

  async listTemplates(wabaId: string, options: { limit?: number; after?: string; status?: string; name?: string } = {}) {
    return this.call<Paged<TemplateInfo>>('GET', `${wabaId}/message_templates`, {
      query: { fields: TEMPLATE_FIELDS, limit: options.limit ?? 100, after: options.after, status: options.status, name: options.name },
    });
  }

  /** Follows pagination (bounded) and returns every template on the WABA. */
  async listAllTemplates(wabaId: string, maxPages = 20): Promise<TemplateInfo[]> {
    const all: TemplateInfo[] = [];
    let after: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const res = await this.listTemplates(wabaId, { after });
      all.push(...res.data);
      after = res.paging?.cursors?.after;
      if (!res.paging?.next || !after) break;
    }
    return all;
  }

  async deleteTemplate(wabaId: string, input: { name: string; hsmId?: string }) {
    return this.call<SuccessResponse>('DELETE', `${wabaId}/message_templates`, {
      query: { name: input.name, hsm_id: input.hsmId },
    });
  }

  async getTemplateStatus(templateId: string) {
    return this.call<TemplateInfo>('GET', templateId, { query: { fields: TEMPLATE_FIELDS } });
  }

  // -------------------------------------------------------------------------
  // Phone numbers
  // -------------------------------------------------------------------------
  async registerPhoneNumber(phoneNumberId: string, pin: string, options: { dataLocalizationRegion?: string } = {}) {
    if (!/^\d{6}$/.test(pin)) throw validationError('The registration PIN must be 6 digits');
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/register`, {
      json: {
        messaging_product: 'whatsapp',
        pin,
        ...(options.dataLocalizationRegion ? { data_localization_region: options.dataLocalizationRegion } : {}),
      },
      retries: 1,
    });
  }

  async deregisterPhoneNumber(phoneNumberId: string) {
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/deregister`, { json: {} });
  }

  async requestVerificationCode(phoneNumberId: string, options: { method?: 'SMS' | 'VOICE'; language?: string } = {}) {
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/request_code`, {
      json: { code_method: options.method ?? 'SMS', language: options.language ?? 'en_US' },
      retries: 0,
    });
  }

  async verifyPhoneNumber(phoneNumberId: string, code: string) {
    if (!/^\d{4,8}$/.test(code)) throw validationError('Verification code must be numeric');
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/verify_code`, { json: { code }, retries: 0 });
  }

  async setTwoStepPin(phoneNumberId: string, pin: string) {
    if (!/^\d{6}$/.test(pin)) throw validationError('The two-step PIN must be 6 digits');
    return this.call<SuccessResponse>('POST', phoneNumberId, { json: { pin } });
  }

  async updatePhoneProfile(phoneNumberId: string, profile: BusinessProfile) {
    if (profile.about && profile.about.length > 139) throw validationError('"About" is limited to 139 characters');
    return this.call<SuccessResponse>('POST', `${phoneNumberId}/whatsapp_business_profile`, {
      json: { messaging_product: 'whatsapp', ...profile },
    });
  }

  async getPhoneProfile(phoneNumberId: string) {
    const res = await this.call<{ data: (BusinessProfile & { profile_picture_url?: string })[] }>(
      'GET',
      `${phoneNumberId}/whatsapp_business_profile`,
      { query: { fields: 'about,address,description,email,profile_picture_url,websites,vertical' } },
    );
    return res.data[0] ?? {};
  }

  async getPhoneNumber(phoneNumberId: string) {
    return this.call<PhoneNumberInfo>('GET', phoneNumberId, { query: { fields: PHONE_FIELDS } });
  }

  async getPhoneQuality(phoneNumberId: string) {
    const info = await this.call<PhoneNumberInfo>('GET', phoneNumberId, {
      query: { fields: 'quality_rating,messaging_limit_tier,throughput,status,name_status' },
    });
    return {
      qualityRating: info.quality_rating ?? 'UNKNOWN',
      messagingLimitTier: info.messaging_limit_tier ?? null,
      throughputLevel: info.throughput?.level ?? null,
      status: info.status ?? null,
      nameStatus: info.name_status ?? null,
    };
  }

  async listWabaPhoneNumbers(wabaId: string): Promise<PhoneNumberInfo[]> {
    const all: PhoneNumberInfo[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const res = await this.call<Paged<PhoneNumberInfo>>('GET', `${wabaId}/phone_numbers`, {
        query: { fields: PHONE_FIELDS, limit: 100, after },
      });
      all.push(...res.data);
      after = res.paging?.cursors?.after;
      if (!res.paging?.next || !after) break;
    }
    return all;
  }

  /**
   * Requests a display-name change. Meta reviews the new name and reports the
   * decision via the `phone_number_name_update` webhook.
   */
  async requestDisplayNameChange(phoneNumberId: string, newDisplayName: string) {
    if (newDisplayName.trim().length < 3) throw validationError('Display name is too short');
    return this.call<SuccessResponse>('POST', phoneNumberId, { query: { new_display_name: newDisplayName.trim() } });
  }

  // -------------------------------------------------------------------------
  // WhatsApp Business Account
  // -------------------------------------------------------------------------
  async getWaba(wabaId: string) {
    return this.call<WabaInfo>('GET', wabaId, { query: { fields: WABA_FIELDS } });
  }

  /** Subscribes this app to the WABA's webhooks (required after Embedded Signup). */
  async subscribeApp(wabaId: string, options: { overrideCallbackUri?: string; verifyToken?: string } = {}) {
    return this.call<SuccessResponse>('POST', `${wabaId}/subscribed_apps`, {
      json: options.overrideCallbackUri
        ? { override_callback_uri: options.overrideCallbackUri, verify_token: options.verifyToken }
        : {},
    });
  }

  async listSubscribedApps(wabaId: string) {
    return this.call<{ data: { whatsapp_business_api_data?: { id: string; name: string } }[] }>('GET', `${wabaId}/subscribed_apps`);
  }

  async unsubscribeApp(wabaId: string) {
    return this.call<SuccessResponse>('DELETE', `${wabaId}/subscribed_apps`);
  }
}

// ---------------------------------------------------------------------------
// Embedded Signup / OAuth (app-level calls, not bound to a WABA token)
// ---------------------------------------------------------------------------
export interface AppCredentials extends GraphTransportOptions {
  appId: string;
  appSecret: string;
}

/**
 * Exchanges the Embedded Signup `code` (FB.login with response_type=code) for
 * a long-lived Business Integration System User access token.
 */
export async function exchangeCodeForToken(
  credentials: AppCredentials & { code: string; redirectUri?: string },
): Promise<TokenExchangeResult> {
  const transport = new GraphTransport(credentials);
  const res = await transport.request<{ access_token: string; token_type?: string; expires_in?: number }>(
    'GET',
    'oauth/access_token',
    {
      query: {
        client_id: credentials.appId,
        client_secret: credentials.appSecret,
        code: credentials.code,
        redirect_uri: credentials.redirectUri,
      },
      retries: 0,
    },
  );
  if (!res.access_token) {
    throw new WhatsAppApiError({ message: 'No access token in OAuth response', status: 502, category: 'auth', retryable: false, raw: res });
  }
  return { accessToken: res.access_token, tokenType: res.token_type ?? 'bearer', expiresIn: res.expires_in };
}

/** Inspects a token: validity, expiry and granular scopes (which WABAs it can access). */
export async function debugToken(credentials: AppCredentials & { inputToken: string }): Promise<DebugTokenResult> {
  const transport = new GraphTransport(credentials);
  const res = await transport.request<{
    data?: {
      app_id?: string;
      is_valid?: boolean;
      user_id?: string;
      expires_at?: number;
      scopes?: string[];
      granular_scopes?: { scope: string; target_ids?: string[] }[];
    };
  }>('GET', 'debug_token', {
    query: { input_token: credentials.inputToken, access_token: `${credentials.appId}|${credentials.appSecret}` },
  });
  const data = res.data ?? {};
  return {
    appId: data.app_id ?? null,
    isValid: Boolean(data.is_valid),
    userId: data.user_id ?? null,
    expiresAt: data.expires_at ? new Date(data.expires_at * 1000) : null,
    scopes: data.scopes ?? [],
    granularScopes: (data.granular_scopes ?? []).map((g) => ({ scope: g.scope, targetIds: g.target_ids ?? [] })),
  };
}

/** WABA ids the token was granted (from the whatsapp_business_management scope). */
export function wabaIdsFromDebugToken(result: DebugTokenResult): string[] {
  const ids = result.granularScopes
    .filter((g) => g.scope === 'whatsapp_business_management' || g.scope === 'whatsapp_business_messaging')
    .flatMap((g) => g.targetIds);
  return [...new Set(ids)];
}
