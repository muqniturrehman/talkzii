import { NextResponse, type NextRequest } from 'next/server';
import Stripe from 'stripe';
import type { Json } from '@talkzi/db';
import { ApiError, errorResponse } from '@/lib/api/errors';
import { getStripe, handleStripeEvent } from '@/lib/billing/stripe';
import { configured, env } from '@/lib/env';
import { logger } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Stripe webhook: verifies Stripe-Signature, records the event once in
 * webhook_events (deduped by event id) and syncs the subscription. A failure
 * returns 500 so Stripe retries; already-processed events are acknowledged.
 */
export async function POST(req: NextRequest) {
  const log = logger.child({ webhook: 'stripe' });
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!configured.stripe() || !secret) return errorResponse(ApiError.notConfigured('Stripe webhooks'), log);

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = Stripe.webhooks.constructEvent(raw, req.headers.get('stripe-signature') ?? '', secret);
  } catch {
    return errorResponse(ApiError.badRequest('Invalid Stripe signature.'), log);
  }

  const admin = createSupabaseAdminClient();
  let rowId: string | null = null;
  let attempts = 0;
  const { data: inserted, error } = await admin
    .from('webhook_events')
    .insert({ source: 'stripe', external_id: event.id, event_type: event.type, payload: event as unknown as Json, signature_valid: true })
    .select('id')
    .single();
  if (inserted) {
    rowId = inserted.id;
  } else if (error?.code === '23505') {
    const { data: existing } = await admin.from('webhook_events').select('id, status, attempts').eq('source', 'stripe').eq('external_id', event.id).maybeSingle();
    if (existing?.status === 'processed' || existing?.status === 'ignored') return NextResponse.json({ received: true, duplicate: true });
    rowId = existing?.id ?? null;
    attempts = existing?.attempts ?? 0;
  } else {
    log.error({ err: error, eventId: event.id }, 'Could not record Stripe event; processing anyway');
  }

  try {
    const outcome = await handleStripeEvent(event, { stripe: getStripe(), admin, log: log.child({ eventId: event.id, type: event.type }) });
    if (rowId) await admin.from('webhook_events').update({ status: outcome, attempts: attempts + 1, processed_at: new Date().toISOString(), error: null }).eq('id', rowId);
    return NextResponse.json({ received: true });
  } catch (err) {
    log.error({ err, eventId: event.id, type: event.type }, 'Stripe event processing failed');
    if (rowId) {
      await admin
        .from('webhook_events')
        .update({ status: 'failed', attempts: attempts + 1, error: err instanceof Error ? err.message.slice(0, 500) : 'failed' })
        .eq('id', rowId);
    }
    return NextResponse.json({ error: { code: 'INTERNAL_ERROR', message: 'Processing failed; Stripe will retry.' } }, { status: 500 });
  }
}
