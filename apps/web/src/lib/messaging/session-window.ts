import { ApiError } from '@/lib/api/errors';

export const SESSION_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True while the 24-hour customer service window is open. */
export function isSessionOpen(expiresAt: string | Date | null | undefined, now: Date = new Date()): boolean {
  if (!expiresAt) return false;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
  return !Number.isNaN(end.getTime()) && end.getTime() > now.getTime();
}

/** Milliseconds left in the window (0 when closed). */
export function sessionTimeLeft(expiresAt: string | Date | null | undefined, now: Date = new Date()): number {
  if (!isSessionOpen(expiresAt, now)) return 0;
  const end = expiresAt instanceof Date ? expiresAt : new Date(expiresAt as string);
  return end.getTime() - now.getTime();
}

/** "23h 12m left" style label for the inbox header. */
export function formatSessionTimeLeft(ms: number): string {
  if (ms <= 0) return 'Session expired';
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  return hours > 0 ? `${hours}h ${minutes}m left` : `${Math.max(minutes, 1)}m left`;
}

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
