/**
 * Normalises Graph API / WhatsApp Cloud API errors into a typed error with a
 * category and a retryable flag the rest of the app can reason about.
 */
export type WhatsAppErrorCategory =
  | 'auth'
  | 'permission'
  | 'rate_limit'
  | 'invalid_request'
  | 'template'
  | 'recipient'
  | 'policy'
  | 'media'
  | 'phone_number'
  | 'server'
  | 'network'
  | 'unknown';

interface ErrorInfo {
  category: WhatsAppErrorCategory;
  retryable: boolean;
  description: string;
}

/** https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes */
export const WHATSAPP_ERROR_CODES: Record<number, ErrorInfo> = {
  0: { category: 'auth', retryable: false, description: 'Authentication exception — the access token could not be validated.' },
  1: { category: 'server', retryable: true, description: 'Unknown API error (possibly temporary).' },
  2: { category: 'server', retryable: true, description: 'Service temporarily unavailable.' },
  3: { category: 'permission', retryable: false, description: 'The app lacks the capability or permission for this call.' },
  4: { category: 'rate_limit', retryable: true, description: 'Application request limit reached.' },
  10: { category: 'permission', retryable: false, description: 'Permission denied or permission removed.' },
  17: { category: 'rate_limit', retryable: true, description: 'User request limit reached.' },
  100: { category: 'invalid_request', retryable: false, description: 'Invalid parameter.' },
  190: { category: 'auth', retryable: false, description: 'Access token expired or invalid — reconnect WhatsApp.' },
  200: { category: 'permission', retryable: false, description: 'Permission error.' },
  368: { category: 'policy', retryable: false, description: 'Temporarily blocked for policy violations.' },
  613: { category: 'rate_limit', retryable: true, description: 'Rate limit hit.' },
  80007: { category: 'rate_limit', retryable: true, description: 'WhatsApp Business Account rate limit hit.' },
  130429: { category: 'rate_limit', retryable: true, description: 'Cloud API message throughput reached.' },
  130472: { category: 'recipient', retryable: false, description: 'User’s number is part of a Meta experiment.' },
  130497: { category: 'policy', retryable: false, description: 'Business account restricted from messaging users in this country.' },
  131000: { category: 'server', retryable: true, description: 'Something went wrong on Meta’s side.' },
  131005: { category: 'permission', retryable: false, description: 'Access denied.' },
  131008: { category: 'invalid_request', retryable: false, description: 'Required parameter is missing.' },
  131009: { category: 'invalid_request', retryable: false, description: 'Parameter value is not valid.' },
  131016: { category: 'server', retryable: true, description: 'Service unavailable.' },
  131021: { category: 'recipient', retryable: false, description: 'Recipient cannot be the sender.' },
  131026: { category: 'recipient', retryable: false, description: 'Message undeliverable (number not on WhatsApp, outdated app, or not accepted terms).' },
  131030: { category: 'recipient', retryable: false, description: 'Recipient is not in the allowed list (test number).' },
  131031: { category: 'policy', retryable: false, description: 'Business account has been locked.' },
  131042: { category: 'policy', retryable: false, description: 'Business eligibility payment issue — check your payment method in Meta.' },
  131045: { category: 'phone_number', retryable: false, description: 'Phone number certificate is incorrect.' },
  131047: { category: 'policy', retryable: false, description: 'More than 24 hours have passed since the customer last replied — use a template.' },
  131048: { category: 'rate_limit', retryable: false, description: 'Spam rate limit hit — too many messages were blocked or flagged.' },
  131049: { category: 'policy', retryable: false, description: 'Meta chose not to deliver this marketing message to maintain ecosystem health.' },
  131050: { category: 'recipient', retryable: false, description: 'The user has stopped marketing messages from your business.' },
  131051: { category: 'invalid_request', retryable: false, description: 'Unsupported message type.' },
  131052: { category: 'media', retryable: false, description: 'Media download error.' },
  131053: { category: 'media', retryable: false, description: 'Media upload error.' },
  131056: { category: 'rate_limit', retryable: false, description: 'Too many messages to the same user in a short time (pair rate limit).' },
  131057: { category: 'policy', retryable: false, description: 'Business account is in maintenance mode.' },
  132000: { category: 'template', retryable: false, description: 'Template parameter count mismatch.' },
  132001: { category: 'template', retryable: false, description: 'Template does not exist in this language or is not approved.' },
  132005: { category: 'template', retryable: false, description: 'Template text is too long after variables are filled in.' },
  132007: { category: 'template', retryable: false, description: 'Template violates the formatting character policy.' },
  132012: { category: 'template', retryable: false, description: 'Template parameter format mismatch.' },
  132015: { category: 'template', retryable: false, description: 'Template is paused due to low quality.' },
  132016: { category: 'template', retryable: false, description: 'Template is disabled due to low quality.' },
  132068: { category: 'template', retryable: false, description: 'Flow is blocked.' },
  132069: { category: 'template', retryable: false, description: 'Flow is throttled.' },
  133000: { category: 'phone_number', retryable: false, description: 'Incomplete deregistration — deregister the number again.' },
  133004: { category: 'server', retryable: true, description: 'Server temporarily unavailable.' },
  133005: { category: 'phone_number', retryable: false, description: 'Two-step verification PIN mismatch.' },
  133006: { category: 'phone_number', retryable: false, description: 'Phone number needs to be verified before registering.' },
  133008: { category: 'phone_number', retryable: false, description: 'Too many two-step verification PIN guesses.' },
  133009: { category: 'phone_number', retryable: false, description: 'Two-step verification PIN guessed too fast.' },
  133010: { category: 'phone_number', retryable: false, description: 'Phone number is not registered on the Cloud API.' },
  133015: { category: 'phone_number', retryable: false, description: 'Please wait a few minutes before registering this number again.' },
  135000: { category: 'invalid_request', retryable: false, description: 'Generic user error.' },
};

export interface GraphErrorBody {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
    fbtrace_id?: string;
    error_data?: { messaging_product?: string; details?: string };
  };
}

export class WhatsAppApiError extends Error {
  readonly status: number;
  readonly code: number | null;
  readonly subcode: number | null;
  readonly type: string | null;
  readonly fbtraceId: string | null;
  readonly details: string | null;
  readonly category: WhatsAppErrorCategory;
  readonly retryable: boolean;
  readonly userTitle: string | null;
  readonly userMessage: string | null;
  readonly raw: unknown;

  constructor(init: {
    message: string;
    status: number;
    code?: number | null;
    subcode?: number | null;
    type?: string | null;
    fbtraceId?: string | null;
    details?: string | null;
    category: WhatsAppErrorCategory;
    retryable: boolean;
    userTitle?: string | null;
    userMessage?: string | null;
    raw?: unknown;
  }) {
    super(init.message);
    this.name = 'WhatsAppApiError';
    this.status = init.status;
    this.code = init.code ?? null;
    this.subcode = init.subcode ?? null;
    this.type = init.type ?? null;
    this.fbtraceId = init.fbtraceId ?? null;
    this.details = init.details ?? null;
    this.category = init.category;
    this.retryable = init.retryable;
    this.userTitle = init.userTitle ?? null;
    this.userMessage = init.userMessage ?? null;
    this.raw = init.raw;
  }

  /** Human-friendly explanation suitable for showing to an agent. */
  get friendlyMessage(): string {
    return (this.code !== null ? WHATSAPP_ERROR_CODES[this.code]?.description : undefined) ?? this.userMessage ?? this.message;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      code: this.code,
      subcode: this.subcode,
      category: this.category,
      retryable: this.retryable,
      details: this.details,
      fbtraceId: this.fbtraceId,
    };
  }
}

function categoryFromStatus(status: number): ErrorInfo {
  if (status === 401) return { category: 'auth', retryable: false, description: 'Unauthorized' };
  if (status === 403) return { category: 'permission', retryable: false, description: 'Forbidden' };
  if (status === 404) return { category: 'invalid_request', retryable: false, description: 'Not found' };
  if (status === 429) return { category: 'rate_limit', retryable: true, description: 'Too many requests' };
  if (status >= 500) return { category: 'server', retryable: true, description: 'Server error' };
  if (status >= 400) return { category: 'invalid_request', retryable: false, description: 'Bad request' };
  return { category: 'unknown', retryable: false, description: 'Unknown error' };
}

/** Builds a WhatsAppApiError from an HTTP status and (possibly non-JSON) body. */
export function normalizeGraphError(status: number, body: unknown): WhatsAppApiError {
  const err = (body as GraphErrorBody | null)?.error;
  const code = typeof err?.code === 'number' ? err.code : null;
  const known = code !== null ? WHATSAPP_ERROR_CODES[code] : undefined;
  const fallback = categoryFromStatus(status);
  const info = known ?? fallback;
  // 5xx and 429 are always worth retrying, whatever the code says.
  const retryable = status === 429 || status >= 500 ? true : info.retryable;

  return new WhatsAppApiError({
    message: err?.message ?? (typeof body === 'string' && body ? body.slice(0, 300) : `Graph API request failed (${status})`),
    status,
    code,
    subcode: typeof err?.error_subcode === 'number' ? err.error_subcode : null,
    type: err?.type ?? null,
    fbtraceId: err?.fbtrace_id ?? null,
    details: err?.error_data?.details ?? null,
    category: info.category,
    retryable,
    userTitle: err?.error_user_title ?? null,
    userMessage: err?.error_user_msg ?? null,
    raw: body,
  });
}

/** Wraps fetch/network failures (DNS, reset, timeout) as retryable network errors. */
export function networkError(cause: unknown, timedOut = false): WhatsAppApiError {
  const message = timedOut
    ? 'Request to the WhatsApp Cloud API timed out'
    : `Network error calling the WhatsApp Cloud API: ${cause instanceof Error ? cause.message : String(cause)}`;
  return new WhatsAppApiError({ message, status: 0, category: 'network', retryable: true, raw: cause });
}

export function isWhatsAppApiError(error: unknown): error is WhatsAppApiError {
  return error instanceof WhatsAppApiError;
}

/** WhatsApp status-webhook error codes that mean "the 24h window is closed". */
export const SESSION_WINDOW_ERROR_CODES = new Set([131047]);
