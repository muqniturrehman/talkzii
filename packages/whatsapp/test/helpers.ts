import { vi } from 'vitest';

export interface RecordedCall {
  url: URL;
  method: string;
  headers: Record<string, string>;
  body: BodyInit | null | undefined;
  json: unknown;
}

type Responder = Response | Error | ((call: RecordedCall) => Response | Promise<Response>);

export function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function graphError(status: number, code: number, message = 'error', extra: Record<string, unknown> = {}): Response {
  return jsonResponse(status, { error: { message, type: 'OAuthException', code, fbtrace_id: 'TRACE123', ...extra } });
}

/** Queue-based fetch mock that records every call. */
export function mockFetch(...responders: Responder[]) {
  const calls: RecordedCall[] = [];
  const fn = vi.fn(async (input: string | URL | Request, init: RequestInit = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers as HeadersInit).entries());
    let json: unknown;
    if (typeof init.body === 'string') {
      try {
        json = JSON.parse(init.body);
      } catch {
        json = undefined;
      }
    }
    const call: RecordedCall = {
      url: new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url),
      method: init.method ?? 'GET',
      headers,
      body: init.body,
      json,
    };
    calls.push(call);
    const next = responders.shift();
    if (!next) throw new Error(`Unexpected fetch call #${calls.length}: ${call.method} ${call.url}`);
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next(call) : next;
  });
  return { fetch: fn as unknown as typeof fetch, calls };
}

export const sendOk = (wamid = 'wamid.TEST123', waId = '923001234567') =>
  jsonResponse(200, { messaging_product: 'whatsapp', contacts: [{ input: waId, wa_id: waId }], messages: [{ id: wamid }] });

/** Records requested sleeps instead of waiting. */
export function fakeSleep() {
  const delays: number[] = [];
  const sleep = async (ms: number) => {
    delays.push(ms);
  };
  return { sleep, delays };
}
