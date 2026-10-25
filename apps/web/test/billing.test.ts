import { createDecipheriv, createHmac } from 'node:crypto';
import { NextRequest } from 'next/server';
import Stripe from 'stripe';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMemoryDb } from './helpers/memory-db';

const memory = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createSupabaseAdminClient: () => memory.db }));

import { POST as jazzcashCallback } from '@/app/api/billing/jazzcash/callback/route';
import { POST as stripeWebhook } from '@/app/api/billing/stripe/webhook/route';
import {
  buildEasypaisaCheckout,
  buildJazzcashCheckout,
  easypaisaHashedRequest,
  jazzcashSecureHash,
  pktTimestamp,
  verifyJazzcashCallback,
} from '@/lib/billing/local';
import { handleStripeEvent, mapStripeStatus, subscriptionToRow, syncSubscription } from '@/lib/billing/stripe';
import { logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

const WS = '6f1c3c1e-8a3b-4b8e-9c55-1d2f3a4b5c6d';
const log = logger.child({ test: 'billing' });

function fakeSubscription(overrides: Partial<Record<string, unknown>> = {}, lookupKey = 'talkzi_pro_month_usd'): Stripe.Subscription {
  return {
    id: 'sub_1',
    object: 'subscription',
    status: 'active',
    customer: 'cus_1',
    currency: 'usd',
    cancel_at_period_end: false,
    cancel_at: null,
    trial_end: null,
    metadata: { workspace_id: WS },
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          current_period_start: 1_761_264_000,
          current_period_end: 1_763_942_400,
          price: { id: 'price_1', lookup_key: lookupKey, recurring: { interval: lookupKey.includes('_year_') ? 'year' : 'month' } },
        },
      ],
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

let db: ReturnType<typeof createMemoryDb>;
beforeEach(() => {
  db = createMemoryDb({ webhook_events: [['source', 'external_id']], billing_subscriptions: [['workspace_id']] });
  memory.db = db;
});
afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  delete process.env.JAZZCASH_MERCHANT_ID;
  delete process.env.JAZZCASH_INTEGRITY_SALT;
});

describe('Stripe subscription sync', () => {
  it('maps a subscription to a billing row via the price lookup key', () => {
    const row = subscriptionToRow(fakeSubscription({ cancel_at: 1_763_942_400 }, 'talkzi_agency_year_pkr'), WS);
    expect(row).toMatchObject({
      workspace_id: WS,
      provider: 'stripe',
      plan: 'agency',
      status: 'active',
      billing_interval: 'year',
      stripe_customer_id: 'cus_1',
      stripe_subscription_id: 'sub_1',
      stripe_price_id: 'price_1',
      current_period_end: new Date(1_763_942_400 * 1000).toISOString(),
      cancel_at_period_end: true,
    });
    expect(mapStripeStatus('incomplete_expired')).toBe('canceled');
    expect(mapStripeStatus('paused')).toBe('unpaid');
    expect(mapStripeStatus('past_due')).toBe('past_due');
  });

  it('applies live subscriptions and ignores stale or unpaid ones that are not current', async () => {
    const admin = db as unknown as TypedSupabaseClient;
    await syncSubscription(admin, fakeSubscription(), log);
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ plan: 'pro', status: 'active', stripe_subscription_id: 'sub_1' });
    expect(db.table('audit_log')).toHaveLength(1);

    // A late "canceled" for an older subscription must not downgrade the current one.
    expect(await syncSubscription(admin, fakeSubscription({ id: 'sub_old', status: 'canceled' }), log)).toBeNull();
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ status: 'active', stripe_subscription_id: 'sub_1' });

    // The current subscription ending does apply.
    await syncSubscription(admin, fakeSubscription({ status: 'canceled' }), log);
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ status: 'canceled' });
  });

  it('protects a prepaid wallet plan until a new card subscription is live', async () => {
    db.table('billing_subscriptions').push({ id: 'b1', workspace_id: WS, provider: 'jazzcash', plan: 'pro', status: 'active', stripe_subscription_id: null, stripe_customer_id: 'cus_1' });
    const admin = db as unknown as TypedSupabaseClient;
    expect(await syncSubscription(admin, fakeSubscription({ id: 'sub_2', status: 'incomplete', metadata: {} }), log)).toBeNull();
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ provider: 'jazzcash', status: 'active' });

    // Without metadata the workspace is found through the Stripe customer id.
    await syncSubscription(admin, fakeSubscription({ id: 'sub_2', metadata: {} }, 'talkzi_agency_month_usd'), log);
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ provider: 'stripe', plan: 'agency', stripe_subscription_id: 'sub_2' });
  });

  it('re-reads subscriptions from Stripe on events and ignores unrelated ones', async () => {
    const retrieve = vi.fn(async () => fakeSubscription({ status: 'past_due' }));
    const stripe = { subscriptions: { retrieve } } as unknown as Stripe;
    const admin = db as unknown as TypedSupabaseClient;
    const updated = { id: 'evt_1', type: 'customer.subscription.updated', data: { object: { id: 'sub_1' } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(updated, { stripe, admin, log })).toBe('processed');
    expect(retrieve).toHaveBeenCalledWith('sub_1');
    expect(db.table('billing_subscriptions')[0]).toMatchObject({ status: 'past_due' });

    const charge = { id: 'evt_2', type: 'charge.succeeded', data: { object: { id: 'ch_1' } } } as unknown as Stripe.Event;
    expect(await handleStripeEvent(charge, { stripe, admin, log })).toBe('ignored');
  });
});

describe('Stripe webhook route', () => {
  const secret = 'whsec_test_secret';
  const payload = JSON.stringify({ id: 'evt_route_1', object: 'event', type: 'customer.created', data: { object: { id: 'cus_9', object: 'customer' } } });
  const request = (signature: string) =>
    new NextRequest('http://localhost/api/billing/stripe/webhook', { method: 'POST', body: payload, headers: { 'stripe-signature': signature } });

  it('rejects bad signatures, records events once and acknowledges replays', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_123';
    process.env.STRIPE_WEBHOOK_SECRET = secret;

    expect((await stripeWebhook(request('t=1,v1=bad'))).status).toBe(400);

    const header = Stripe.webhooks.generateTestHeaderString({ payload, secret });
    const first = await stripeWebhook(request(header));
    expect(first.status).toBe(200);
    expect(db.table('webhook_events')[0]).toMatchObject({ source: 'stripe', external_id: 'evt_route_1', status: 'ignored', signature_valid: true });

    const replay = await stripeWebhook(request(header));
    expect(await replay.json()).toEqual({ received: true, duplicate: true });
    expect(db.table('webhook_events')).toHaveLength(1);
  });
});

describe('JazzCash adapter', () => {
  const config = { merchantId: 'MC12345', password: 'pass123', integritySalt: 'salt-abc' };

  it('formats Pakistan time and signs sorted non-empty pp fields', () => {
    expect(pktTimestamp(new Date('2026-10-24T19:30:00Z'))).toBe('20261025003000');
    const fields = { pp_B: '2', pp_A: '1', pp_Empty: '', pp_SecureHash: 'IGNORED', other: 'x' };
    const expected = createHmac('sha256', 'salt-abc').update('salt-abc&1&2').digest('hex').toUpperCase();
    expect(jazzcashSecureHash(fields, 'salt-abc')).toBe(expected);
  });

  it('builds a signed checkout whose response signature round-trips', () => {
    const form = buildJazzcashCheckout(
      { reference: 'TZ202610241200001234', amountPkr: 7999, description: 'Talkzi Pro (monthly)!', returnUrl: 'https://app.test/cb', now: new Date('2026-10-24T07:00:00Z') },
      config,
    );
    expect(form.fields).toMatchObject({ pp_Amount: '799900', pp_TxnCurrency: 'PKR', pp_TxnDateTime: '20261024120000', pp_Description: 'Talkzi Pro monthly' });
    expect(verifyJazzcashCallback(form.fields, config.integritySalt)).toBe(true);
    expect(verifyJazzcashCallback({ ...form.fields, pp_Amount: '100' }, config.integritySalt)).toBe(false);
  });

  it('activates the plan only for verified, successful callbacks of the right amount', async () => {
    process.env.JAZZCASH_MERCHANT_ID = config.merchantId;
    process.env.JAZZCASH_INTEGRITY_SALT = config.integritySalt;
    db.table('billing_payments').push({ id: 'pay-1', workspace_id: WS, provider: 'jazzcash', reference: 'TZREF1', amount: 7999, status: 'pending', plan: 'pro' });

    const callback = (fields: Record<string, string>) => {
      const signed = { ...fields, pp_SecureHash: jazzcashSecureHash(fields, config.integritySalt) };
      return jazzcashCallback(new NextRequest('http://localhost/api/billing/jazzcash/callback', { method: 'POST', body: new URLSearchParams(signed) }));
    };

    const tampered = await jazzcashCallback(
      new NextRequest('http://localhost/api/billing/jazzcash/callback', { method: 'POST', body: new URLSearchParams({ pp_TxnRefNo: 'TZREF1', pp_ResponseCode: '000', pp_SecureHash: 'NOPE' }) }),
    );
    expect(tampered.headers.get('location')).toContain('payment=failed');

    const wrongAmount = await callback({ pp_TxnRefNo: 'TZREF1', pp_ResponseCode: '000', pp_Amount: '100' });
    expect(wrongAmount.headers.get('location')).toContain('payment=failed');
    expect(db.rpc).not.toHaveBeenCalled();

    db.table('billing_payments')[0]!.status = 'pending';
    const ok = await callback({ pp_TxnRefNo: 'TZREF1', pp_ResponseCode: '000', pp_Amount: '799900', pp_ResponseMessage: 'Success' });
    expect(ok.status).toBe(303);
    expect(ok.headers.get('location')).toContain('payment=success');
    expect(db.rpc).toHaveBeenCalledWith('activate_prepaid_plan', expect.objectContaining({ p_payment_id: 'pay-1' }));
  });
});

describe('Easypaisa adapter', () => {
  it('encrypts the sorted request with AES-128-ECB', () => {
    const key = '0123456789abcdef';
    const form = buildEasypaisaCheckout(
      { reference: 'TZREF2', amountPkr: 27999, postBackUrl: 'https://app.test/ep', now: new Date('2026-10-24T07:00:00Z') },
      { storeId: '1234', hashKey: key },
    );
    const decipher = createDecipheriv('aes-128-ecb', Buffer.from(key), null);
    const plain = Buffer.concat([decipher.update(Buffer.from(form.fields.merchantHashedReq!, 'base64')), decipher.final()]).toString('utf8');
    expect(plain).toBe('amount=27999.0&autoRedirect=1&expiryDate=20261025 120000&orderRefNum=TZREF2&paymentMethod=MA_PAYMENT_METHOD&postBackURL=https://app.test/ep&storeId=1234');
    expect(() => easypaisaHashedRequest({ a: '1' }, 'short')).toThrow(/16 characters/);
  });
});
