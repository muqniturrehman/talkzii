import 'server-only';
import type { Json } from '@talkzi/db';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createWebhookHooks } from './hooks';
import { processMetaWebhookPayload } from './processor';
import { createSupabaseWebhookStore } from './supabase-store';

/** Persists a verified payload in webhook_events and returns its id. */
export async function persistMetaEvent(payload: unknown, eventType: string): Promise<string> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('webhook_events')
    .insert({ source: 'meta', event_type: eventType, payload: payload as Json, signature_valid: true, status: 'received' })
    .select('id')
    .single();
  if (error) throw new Error(`Could not store webhook event: ${error.message}`);
  return data.id;
}

/** Processes one stored event and records the outcome on the row. */
export async function runMetaEvent(eventId: string, payload: unknown, attempts = 0): Promise<void> {
  const admin = createSupabaseAdminClient();
  const log = logger.child({ webhookEventId: eventId });
  try {
    const summary = await processMetaWebhookPayload(payload, {
      store: createSupabaseWebhookStore(admin),
      hooks: createWebhookHooks(admin, log),
      log,
    });
    await admin
      .from('webhook_events')
      .update({ status: 'processed', processed_at: new Date().toISOString(), attempts: attempts + 1, error: null })
      .eq('id', eventId);
    log.info({ summary }, 'meta webhook processed');
  } catch (error) {
    log.error({ err: error }, 'meta webhook processing failed');
    await admin
      .from('webhook_events')
      .update({
        status: 'failed',
        attempts: attempts + 1,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 1000),
      })
      .eq('id', eventId);
  }
}
