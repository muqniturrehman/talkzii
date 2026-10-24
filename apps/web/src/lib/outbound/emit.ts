import 'server-only';
import { randomUUID } from 'node:crypto';
import type { WebhookEvent } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { decryptSecret } from '@/lib/crypto';
import { isProduction } from '@/lib/env';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { MAX_DELIVERY_ATTEMPTS, nextAttemptAt, postSignedEvent, type DeliveryAttempt } from './deliver';
import { assertPublicUrl } from './url-guard';

export interface EventEnvelope {
  id: string;
  type: WebhookEvent | 'ping';
  created_at: string;
  workspace_id: string;
  data: Record<string, unknown>;
}

interface HookRow {
  id: string;
  url: string;
  secret_encrypted: string;
  failure_count: number;
}

/** Consecutive failures after which an endpoint is switched off. */
const AUTO_DISABLE_AFTER = 50;

export async function attemptDelivery(
  admin: TypedSupabaseClient,
  delivery: { id: string; attempts: number },
  hook: HookRow,
  envelope: EventEnvelope,
): Promise<DeliveryAttempt> {
  let attempt: DeliveryAttempt;
  try {
    await assertPublicUrl(hook.url, { allowLocalhost: !isProduction() });
    attempt = await postSignedEvent({
      url: hook.url,
      secret: decryptSecret(hook.secret_encrypted),
      event: envelope.type,
      deliveryId: delivery.id,
      body: JSON.stringify(envelope),
    });
  } catch (error) {
    attempt = { ok: false, status: null, body: null, durationMs: 0, error: error instanceof Error ? error.message : 'Delivery failed' };
  }

  const attempts = delivery.attempts + 1;
  const next = attempt.ok || attempts >= MAX_DELIVERY_ATTEMPTS ? null : nextAttemptAt(attempts);
  const now = new Date().toISOString();
  await admin
    .from('webhook_deliveries')
    .update({
      attempts,
      status: attempt.ok ? 'success' : next ? 'pending' : 'failed',
      next_attempt_at: next?.toISOString() ?? null,
      response_status: attempt.status,
      response_body: attempt.body,
      duration_ms: attempt.durationMs,
      error: attempt.error,
    })
    .eq('id', delivery.id);

  const failures = attempt.ok ? 0 : hook.failure_count + 1;
  await admin
    .from('webhooks')
    .update({
      last_delivery_at: now,
      last_status: attempt.status ?? 0,
      failure_count: failures,
      ...(failures >= AUTO_DISABLE_AFTER ? { active: false } : {}),
    })
    .eq('id', hook.id);
  hook.failure_count = failures;
  return attempt;
}

/**
 * Records an event for every active endpoint subscribed to it and tries to
 * deliver straight away; failures are retried by the webhook-retry cron.
 */
export async function emitEvent(
  admin: TypedSupabaseClient,
  workspaceId: string,
  event: WebhookEvent,
  data: Record<string, unknown>,
  log?: Logger,
): Promise<number> {
  try {
    const { data: hooks } = await admin
      .from('webhooks')
      .select('id, url, secret_encrypted, failure_count')
      .eq('workspace_id', workspaceId)
      .eq('active', true)
      .contains('events', [event]);
    if (!hooks?.length) return 0;

    const envelope: EventEnvelope = { id: `evt_${randomUUID()}`, type: event, created_at: new Date().toISOString(), workspace_id: workspaceId, data };
    // Leave a gap before the cron may retry, so it never races the first attempt.
    const retryAfter = new Date(Date.now() + 2 * 60_000).toISOString();
    const { data: deliveries, error } = await admin
      .from('webhook_deliveries')
      .insert(hooks.map((h) => ({ workspace_id: workspaceId, webhook_id: h.id, event, payload: envelope as unknown as Json, status: 'pending' as const, next_attempt_at: retryAfter })))
      .select('id, webhook_id, attempts');
    if (error || !deliveries) {
      log?.error({ err: error, event }, 'Could not record webhook deliveries');
      return 0;
    }
    const byId = new Map(hooks.map((h) => [h.id, h]));
    await Promise.all(deliveries.map((d) => attemptDelivery(admin, d, byId.get(d.webhook_id)!, envelope)));
    return deliveries.length;
  } catch (error) {
    log?.error({ err: error, event }, 'Event emission failed');
    return 0;
  }
}

/** Cron: retry deliveries whose backoff has elapsed. */
export async function processDueDeliveries(admin: TypedSupabaseClient, log: Logger, limit = 50) {
  const { data: due } = await admin
    .from('webhook_deliveries')
    .select('id, attempts, payload, webhook:webhooks(id, url, secret_encrypted, failure_count, active)')
    .eq('status', 'pending')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(limit);

  let delivered = 0;
  let failed = 0;
  for (const d of due ?? []) {
    const hook = d.webhook;
    if (!hook || !hook.active) {
      await admin.from('webhook_deliveries').update({ status: 'failed', error: 'Endpoint disabled or deleted', next_attempt_at: null }).eq('id', d.id);
      failed++;
      continue;
    }
    const result = await attemptDelivery(admin, d, hook, d.payload as unknown as EventEnvelope);
    if (result.ok) delivered++;
    else failed++;
  }
  if ((due ?? []).length) log.info({ delivered, failed }, 'Outbound webhook retries processed');
  return { outboundRetried: due?.length ?? 0, outboundDelivered: delivered };
}
