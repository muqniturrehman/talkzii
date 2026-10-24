/** Browser helper for calling our JSON API: `{ data }` on success, typed error otherwise. */
export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }

  /** Field errors from VALIDATION_ERROR responses ({ fieldErrors: { name: ['…'] } }). */
  get fieldErrors(): Record<string, string[]> {
    const details = this.details as { fieldErrors?: Record<string, string[]> } | undefined;
    return details?.fieldErrors ?? {};
  }
}

export async function apiFetch<T = unknown>(
  path: string,
  init: { method?: string; body?: unknown; signal?: AbortSignal; headers?: Record<string, string> } = {},
): Promise<T> {
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  const res = await fetch(path, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    headers: isForm ? init.headers : { 'Content-Type': 'application/json', ...init.headers },
    body: init.body === undefined ? undefined : isForm ? (init.body as FormData) : JSON.stringify(init.body),
    signal: init.signal,
    credentials: 'same-origin',
  });

  let payload: { data?: T; error?: { code: string; message: string; details?: unknown } } = {};
  try {
    payload = (await res.json()) as typeof payload;
  } catch {
    // non-JSON (e.g. 502 from the platform)
  }

  if (!res.ok || payload.error) {
    throw new ApiClientError(
      payload.error?.message ?? `Request failed (${res.status})`,
      res.status,
      payload.error?.code ?? 'UNKNOWN',
      payload.error?.details,
    );
  }
  return payload.data as T;
}
