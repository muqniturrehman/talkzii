export interface RetryOptions {
  /** Additional attempts after the first (0 disables retries). */
  retries: number;
  minDelayMs: number;
  maxDelayMs: number;
  factor: number;
  jitter: boolean;
}

export const DEFAULT_RETRY: RetryOptions = {
  retries: 3,
  minDelayMs: 300,
  maxDelayMs: 8_000,
  factor: 2,
  jitter: true,
};

/** Exponential backoff with optional full jitter, capped at maxDelayMs. */
export function backoffDelay(attempt: number, options: RetryOptions, random: () => number = Math.random): number {
  const exp = Math.min(options.maxDelayMs, options.minDelayMs * options.factor ** attempt);
  return Math.round(options.jitter ? exp / 2 + random() * (exp / 2) : exp);
}

/** Parses a Retry-After header (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - now);
}

export const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
