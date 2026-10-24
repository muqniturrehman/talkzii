import { NextResponse } from 'next/server';
import { z } from 'zod';
import type { Logger } from '@/lib/logger';

export type ErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'RATE_LIMITED'
  | 'NOT_CONFIGURED'
  | 'NO_WORKSPACE'
  | 'FEATURE_NOT_IN_PLAN'
  | 'PLAN_LIMIT'
  | 'SESSION_WINDOW_CLOSED'
  | 'TEMPLATE_NOT_APPROVED'
  | 'TEMPLATE_LOCKED'
  | 'CONTACT_OPTED_OUT'
  | 'WHATSAPP_ERROR'
  | 'PAYMENT_ERROR'
  | 'AI_ERROR'
  | 'INTERNAL_ERROR';

/** Typed, client-safe API error. `message` is shown to users. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message = 'Bad request', details?: unknown) {
    return new ApiError(400, 'BAD_REQUEST', message, details);
  }
  static unauthorized(message = 'Please sign in to continue.') {
    return new ApiError(401, 'UNAUTHORIZED', message);
  }
  static forbidden(message = 'You do not have permission to do that.') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static notFound(message = 'Not found.') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(message: string, code: ErrorCode = 'CONFLICT', details?: unknown) {
    return new ApiError(409, code, message, details);
  }
  static validation(details: unknown, message = 'Please check the highlighted fields.') {
    return new ApiError(422, 'VALIDATION_ERROR', message, details);
  }
  static rateLimited(retryAfterSeconds?: number) {
    return new ApiError(429, 'RATE_LIMITED', 'Too many requests. Please try again shortly.', { retryAfterSeconds });
  }
  static notConfigured(what: string) {
    return new ApiError(503, 'NOT_CONFIGURED', `${what} is not configured on this server. See SETUP.md.`);
  }
  static noWorkspace() {
    return new ApiError(403, 'NO_WORKSPACE', 'Create or join a workspace first.');
  }
}

export interface ErrorBody {
  error: { code: ErrorCode; message: string; details?: unknown; requestId?: string };
}

/** Postgres/PostgREST errors raised by our SQL functions → typed API errors. */
export function fromPostgrestError(error: { code?: string; message: string; details?: string | null }): ApiError {
  const msg = error.message ?? '';
  if (error.code === '42501' || /row-level security|permission denied/i.test(msg)) {
    return ApiError.forbidden(/only_owners_can_manage_owners/.test(msg) ? 'Only owners can manage owners.' : undefined);
  }
  if (/cannot_remove_last_owner/.test(msg)) return ApiError.conflict('A workspace must keep at least one owner.');
  if (/invitation_(\w+)/.test(msg)) {
    const reason = msg.match(/invitation_(\w+)/)?.[1] ?? 'invalid';
    const map: Record<string, string> = {
      not_found: 'This invitation link is invalid.',
      revoked: 'This invitation was revoked.',
      already_accepted: 'This invitation was already accepted.',
      expired: 'This invitation has expired. Ask for a new one.',
      email_mismatch: 'This invitation was sent to a different email address.',
    };
    return new ApiError(reason === 'email_mismatch' ? 403 : 409, 'CONFLICT', map[reason] ?? 'Invalid invitation.');
  }
  if (error.code === '23505') return ApiError.conflict('That already exists.');
  if (error.code === 'PGRST116') return ApiError.notFound();
  if (error.code === '23503') return ApiError.badRequest('A referenced record does not exist.');
  if (error.code === '23514') return ApiError.badRequest('That value is not allowed.');
  return new ApiError(500, 'INTERNAL_ERROR', 'Database error', process.env.NODE_ENV === 'production' ? undefined : msg);
}

export function errorResponse(error: unknown, log?: Logger, requestId?: string): NextResponse<ErrorBody> {
  let apiError: ApiError;
  if (error instanceof ApiError) {
    apiError = error;
  } else if (error instanceof z.ZodError) {
    apiError = ApiError.validation(z.flattenError(error));
  } else {
    log?.error({ err: error }, 'Unhandled API error');
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong. Please try again.');
  }

  if (apiError.status >= 500 && error instanceof ApiError) log?.error({ err: error }, apiError.message);
  else if (apiError.status >= 400) log?.info({ code: apiError.code, status: apiError.status }, apiError.message);

  const headers: Record<string, string> = requestId ? { 'x-request-id': requestId } : {};
  const retry = (apiError.details as { retryAfterSeconds?: number } | undefined)?.retryAfterSeconds;
  if (apiError.status === 429 && retry) headers['retry-after'] = String(retry);

  return NextResponse.json(
    { error: { code: apiError.code, message: apiError.message, details: apiError.details, requestId } },
    { status: apiError.status, headers },
  );
}
