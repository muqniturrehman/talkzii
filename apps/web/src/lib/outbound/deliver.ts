import { signPayload } from './signature';

export interface DeliveryAttempt {
  ok: boolean;
  status: number | null;
  body: string | null;
  durationMs: number;
  error: string | null;
}

/** Retry schedule after a failed attempt (≈22h in total before giving up). */
export const RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 180, 360, 720];
export const MAX_DELIVERY_ATTEMPTS = RETRY_DELAYS_MINUTES.length + 1;

export function nextAttemptAt(attempts: number, now = new Date()): Date | null {
  const minutes = RETRY_DELAYS_MINUTES[attempts - 1];
  return minutes === undefined ? null : new Date(now.getTime() + minutes * 60_000);
}

/** POSTs one signed event. Never throws — the outcome is returned. */
export async function postSignedEvent(
  input: { url: string; secret: string; event: string; deliveryId: string; body: string },
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10_000,
): Promise<DeliveryAttempt> {
  const started = Date.now();
  try {
    const res = await fetchImpl(input.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Talkzi-Webhooks/1.0',
        'x-talkzi-event': input.event,
        'x-talkzi-delivery': input.deliveryId,
        'x-talkzi-signature': signPayload(input.secret, input.body),
      },
      body: input.body,
    });
    const text = (await res.text().catch(() => '')).slice(0, 2_000);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: text || null, durationMs: Date.now() - started, error: null };
  } catch (error) {
    const message = error instanceof Error ? (error.name === 'TimeoutError' ? `Timed out after ${timeoutMs / 1000}s` : error.message) : 'Request failed';
    return { ok: false, status: null, body: null, durationMs: Date.now() - started, error: message.slice(0, 500) };
  }
}
