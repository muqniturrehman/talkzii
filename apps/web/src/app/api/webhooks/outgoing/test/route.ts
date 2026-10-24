import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { attemptDelivery, type EventEnvelope } from '@/lib/outbound/emit';

export const maxDuration = 30;

/** Sends a signed `ping` event to an endpoint right now and reports the result. */
export const POST = createHandler({ role: 'admin', body: z.object({ webhookId: z.uuid() }) }, async ({ admin, body, workspace }) => {
  const db = admin();
  const { data: hook } = await db
    .from('webhooks')
    .select('id, url, secret_encrypted, failure_count')
    .eq('id', body.webhookId)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!hook) throw ApiError.notFound('Webhook not found.');

  const envelope: EventEnvelope = {
    id: `evt_${randomUUID()}`,
    type: 'ping',
    created_at: new Date().toISOString(),
    workspace_id: workspace.id,
    data: { message: 'Hello from Talkzi — your endpoint is reachable.' },
  };
  const { data: delivery, error } = await db
    .from('webhook_deliveries')
    .insert({ workspace_id: workspace.id, webhook_id: hook.id, event: 'ping', payload: envelope as unknown as Json, status: 'pending', next_attempt_at: null })
    .select('id, attempts')
    .single();
  if (error || !delivery) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not record the test delivery.');

  // A test is a one-off: mark it final after this attempt regardless of outcome.
  const attempt = await attemptDelivery(db, { id: delivery.id, attempts: 7 }, hook, envelope);
  return { ok: attempt.ok, status: attempt.status, durationMs: attempt.durationMs, error: attempt.error, body: attempt.body?.slice(0, 500) ?? null };
});
