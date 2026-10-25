import 'server-only';
import { isProduction } from '@/lib/env';
import { assertPublicUrl } from '@/lib/outbound/url-guard';
import type { FlowHttpRequest, FlowHttpResponse } from './engine';

const TIMEOUT_MS = 8_000;
const MAX_BODY = 64 * 1024;
const BLOCKED_HEADERS = new Set(['host', 'content-length', 'connection', 'transfer-encoding', 'cookie']);

/**
 * HTTP request step for chatbots: public https URLs only (SSRF guard), no
 * redirects, 8s timeout, 64 KB of response. Never throws — failures take the
 * step's Error path.
 */
export async function performFlowRequest(request: FlowHttpRequest, fetchImpl: typeof fetch = fetch): Promise<FlowHttpResponse> {
  try {
    await assertPublicUrl(request.url, { allowLocalhost: !isProduction() });
    const headers: Record<string, string> = { 'user-agent': 'Talkzi-Chatbot/1.0', accept: 'application/json, text/plain;q=0.9, */*;q=0.5' };
    for (const [key, value] of Object.entries(request.headers)) if (!BLOCKED_HEADERS.has(key.toLowerCase())) headers[key.toLowerCase()] = value;
    if (request.body !== undefined) headers['content-type'] ??= 'application/json';
    const res = await fetchImpl(request.url, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined,
      redirect: 'manual',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text().catch(() => '');
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: text.slice(0, MAX_BODY) };
  } catch (error) {
    return { ok: false, status: null, body: error instanceof Error ? error.message : 'Request failed' };
  }
}
