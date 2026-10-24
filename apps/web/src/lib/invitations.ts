import { hmacSha256, safeEqual, sha256Hex } from '@/lib/crypto';
import { logger } from '@/lib/logger';

/**
 * Signed invitation tokens: base64url(payload).base64url(HMAC-SHA256).
 * The database stores only sha256(token); re-sending rotates the token.
 */
export interface InvitationTokenPayload {
  v: 1;
  /** invitation id */
  iid: string;
  /** workspace id */
  wid: string;
  /** expiry, unix seconds */
  exp: number;
}

let warned = false;

function signingSecret(): string {
  const secret = process.env.INTERNAL_API_SECRET?.trim();
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') throw new Error('INTERNAL_API_SECRET is required in production.');
  if (!warned) {
    logger.warn('INTERNAL_API_SECRET not set — using an insecure development secret.');
    warned = true;
  }
  return 'talkzi-insecure-dev-secret';
}

export function signInvitationToken(payload: InvitationTokenPayload, secret = signingSecret()): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${hmacSha256(secret, body, 'base64url')}`;
}

export type VerifyResult =
  | { ok: true; payload: InvitationTokenPayload; tokenHash: string }
  | { ok: false; reason: 'malformed' | 'bad_signature' | 'expired' };

export function verifyInvitationToken(token: string, secret = signingSecret(), now = Date.now()): VerifyResult {
  const [body, signature] = token.split('.');
  if (!body || !signature) return { ok: false, reason: 'malformed' };
  if (!safeEqual(hmacSha256(secret, body, 'base64url'), signature)) return { ok: false, reason: 'bad_signature' };

  let payload: InvitationTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as InvitationTokenPayload;
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.v !== 1 || !payload.iid || !payload.wid || typeof payload.exp !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (payload.exp * 1000 < now) return { ok: false, reason: 'expired' };
  return { ok: true, payload, tokenHash: sha256Hex(token) };
}

export const INVITATION_TTL_DAYS = 7;
