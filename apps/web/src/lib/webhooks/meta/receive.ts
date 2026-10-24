import { verifyWebhookSignature } from '@talkzi/whatsapp';

export interface ReceiveDeps {
  appSecret: string | undefined;
  /** Stores the raw payload; returns the webhook_events id. */
  persist: (payload: unknown, eventType: string) => Promise<string>;
  /** Processes a stored event (scheduled after the response is sent). */
  schedule: (eventId: string, payload: unknown) => void;
}

export interface ReceiveResult {
  status: number;
  body: string;
  eventId?: string;
}

function fieldsOf(payload: unknown): string {
  const entries = (payload as { entry?: { changes?: { field?: string }[] }[] } | null)?.entry ?? [];
  const fields = new Set(entries.flatMap((e) => (e.changes ?? []).map((c) => c.field ?? 'unknown')));
  return [...fields].join(',') || 'unknown';
}

/**
 * Meta webhook intake: verify X-Hub-Signature-256 over the raw body, persist
 * the payload (webhook_events) and acknowledge quickly. Processing happens
 * after the response; failures are retried by /api/cron/webhook-retry.
 */
export async function receiveMetaWebhook(rawBody: string, signature: string | null, deps: ReceiveDeps): Promise<ReceiveResult> {
  if (!deps.appSecret) return { status: 503, body: 'Webhook app secret is not configured' };
  if (!verifyWebhookSignature(rawBody, signature, deps.appSecret)) {
    return { status: 401, body: 'Invalid signature' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { status: 400, body: 'Invalid JSON' };
  }
  if ((payload as { object?: string } | null)?.object !== 'whatsapp_business_account') {
    return { status: 200, body: 'IGNORED' };
  }

  const eventId = await deps.persist(payload, fieldsOf(payload));
  deps.schedule(eventId, payload);
  return { status: 200, body: 'EVENT_RECEIVED', eventId };
}
