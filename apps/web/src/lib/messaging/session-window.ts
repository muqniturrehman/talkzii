import { ApiError } from '@/lib/api/errors';
import { isSessionOpen } from '@/lib/inbox/session';

export { formatSessionTimeLeft, isSessionOpen, SESSION_WINDOW_MS, sessionTimeLeft } from '@/lib/inbox/session';

/**
 * WhatsApp only allows approved templates outside the 24h window. Every
 * free-form send path calls this before contacting Meta.
 */
export function assertCanSendFreeForm(expiresAt: string | Date | null | undefined, now: Date = new Date()): void {
  if (!isSessionOpen(expiresAt, now)) {
    throw ApiError.conflict(
      'The 24-hour customer service window has closed. Send an approved template instead.',
      'SESSION_WINDOW_CLOSED',
      { expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null },
    );
  }
}
