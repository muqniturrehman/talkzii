import 'server-only';
import Stripe from 'stripe';
import { parseLookupKey, stripeLookupKey, type BillingInterval, type Currency, type PaidPlanId, type PlanId } from '@talkzi/shared';
import type { Enums, Json, TablesInsert } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/lib/audit';
import { appUrl, configured, env } from '@/lib/env';
import type { Logger } from '@/lib/logger';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

let client: Stripe | null = null;

export function getStripe(): Stripe {
  if (!configured.stripe()) throw ApiError.notConfigured('Stripe');
  client ??= new Stripe(env().STRIPE_SECRET_KEY!, { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'Talkzi' } });
  return client;
}

/** Stripe API failures become a typed PAYMENT_ERROR with Stripe's (user-safe) message. */
export function toPaymentError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (error instanceof Stripe.errors.StripeError) return new ApiError(502, 'PAYMENT_ERROR', error.message, { type: error.type, code: error.code });
  return new ApiError(502, 'PAYMENT_ERROR', 'The payment provider could not be reached. Please try again.');
}

const toIso = (unix: number) => new Date(unix * 1000).toISOString();

/** Finds the active Stripe price for a plan via its lookup key (talkzi_pro_month_usd…). */
export async function resolvePrice(stripe: Stripe, plan: PaidPlanId, interval: BillingInterval, currency: Currency): Promise<Stripe.Price> {
  const key = stripeLookupKey(plan, interval, currency);
  const prices = await stripe.prices.list({ lookup_keys: [key], active: true, limit: 1 });
  const price = prices.data[0];
  if (!price) throw new ApiError(503, 'NOT_CONFIGURED', `No active Stripe price with lookup key “${key}”. Create it in the Stripe dashboard (see SETUP.md).`);
  return price;
}

/** Reuses the workspace's Stripe customer or creates one (idempotent for 24h per workspace). */
export async function ensureStripeCustomer(
  stripe: Stripe,
  admin: TypedSupabaseClient,
  workspace: { id: string; name: string; plan: PlanId },
  email: string | null,
): Promise<string> {
  const { data: row } = await admin.from('billing_subscriptions').select('id, stripe_customer_id').eq('workspace_id', workspace.id).maybeSingle();
  if (row?.stripe_customer_id) return row.stripe_customer_id;

  const customer = await stripe.customers.create(
    { name: workspace.name, ...(email ? { email } : {}), metadata: { workspace_id: workspace.id } },
    { idempotencyKey: `talkzi-customer-${workspace.id}` },
  );
  if (row) {
    await admin.from('billing_subscriptions').update({ stripe_customer_id: customer.id }).eq('id', row.id);
  } else {
    // Keep the current plan so creating a customer never changes what the workspace has.
    await admin.from('billing_subscriptions').insert({ workspace_id: workspace.id, provider: 'stripe', plan: workspace.plan, status: 'active', stripe_customer_id: customer.id });
  }
  return customer.id;
}

export async function createCheckoutSession(
  stripe: Stripe,
  input: { workspaceId: string; customerId: string; plan: PaidPlanId; interval: BillingInterval; currency: Currency },
): Promise<string> {
  const price = await resolvePrice(stripe, input.plan, input.interval, input.currency);
  const metadata = { workspace_id: input.workspaceId, plan: input.plan };
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: input.customerId,
    client_reference_id: input.workspaceId,
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
    customer_update: { address: 'auto', name: 'auto' },
    subscription_data: { metadata },
    metadata: { ...metadata, interval: input.interval },
    success_url: `${appUrl()}/app/settings/billing?checkout=success`,
    cancel_url: `${appUrl()}/app/settings/billing?checkout=canceled`,
  });
  if (!session.url) throw new ApiError(502, 'PAYMENT_ERROR', 'Stripe did not return a checkout link.');
  return session.url;
}

export async function createPortalSession(stripe: Stripe, customerId: string): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({ customer: customerId, return_url: `${appUrl()}/app/settings/billing` });
  return session.url;
}

/** Moves an existing subscription to another plan/interval with proration (same currency). */
export async function switchSubscriptionPlan(
  stripe: Stripe,
  subscriptionId: string,
  input: { plan: PaidPlanId; interval: BillingInterval; currency: Currency },
): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const item = subscription.items.data[0];
  if (!item) throw new ApiError(409, 'PAYMENT_ERROR', 'This subscription has no plan to change. Use Manage billing instead.');
  if (subscription.currency.toUpperCase() !== input.currency) {
    throw ApiError.conflict(`Your subscription is billed in ${subscription.currency.toUpperCase()}. Cancel it in Manage billing before switching currency.`);
  }
  const price = await resolvePrice(stripe, input.plan, input.interval, input.currency);
  if (item.price.id === price.id && !subscription.cancel_at_period_end) throw ApiError.conflict('You are already on this plan.');
  return stripe.subscriptions.update(subscription.id, {
    items: [{ id: item.id, price: price.id }],
    proration_behavior: 'create_prorations',
    cancel_at_period_end: false,
    metadata: { ...subscription.metadata, plan: input.plan },
  });
}

const STATUS_MAP: Record<string, Enums<'subscription_status'>> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  incomplete: 'incomplete',
  unpaid: 'unpaid',
  incomplete_expired: 'canceled',
  paused: 'unpaid',
};

export function mapStripeStatus(status: Stripe.Subscription.Status): Enums<'subscription_status'> {
  return STATUS_MAP[status] ?? 'incomplete';
}

const isPaidPlan = (value: unknown): value is PaidPlanId => value === 'pro' || value === 'agency';

/** Stripe subscription → billing_subscriptions row (the plan comes from the price lookup key). */
export function subscriptionToRow(subscription: Stripe.Subscription, workspaceId: string): TablesInsert<'billing_subscriptions'> {
  const item = subscription.items.data[0];
  const fromPrice = parseLookupKey(item?.price.lookup_key);
  const plan: PlanId = fromPrice?.plan ?? (isPaidPlan(subscription.metadata.plan) ? subscription.metadata.plan : 'free');
  return {
    workspace_id: workspaceId,
    provider: 'stripe',
    plan,
    status: mapStripeStatus(subscription.status),
    billing_interval: item?.price.recurring?.interval === 'year' ? 'year' : 'month',
    currency: subscription.currency,
    stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
    stripe_subscription_id: subscription.id,
    stripe_price_id: item?.price.id ?? null,
    current_period_start: item ? toIso(item.current_period_start) : null,
    current_period_end: item ? toIso(item.current_period_end) : null,
    cancel_at_period_end: subscription.cancel_at_period_end || subscription.cancel_at !== null,
    trial_ends_at: subscription.trial_end ? toIso(subscription.trial_end) : null,
    metadata: { lookup_key: item?.price.lookup_key ?? null } as Json,
  };
}

/**
 * Writes the latest state of a Stripe subscription. A subscription that isn't
 * the workspace's current one only takes over once it is live (active,
 * trialing, past_due), so stale events, ended subscriptions and unpaid
 * checkouts can't downgrade a workspace (e.g. one on a prepaid wallet plan).
 */
export async function syncSubscription(
  admin: TypedSupabaseClient,
  subscription: Stripe.Subscription,
  log: Logger,
  workspaceHint?: string,
): Promise<TablesInsert<'billing_subscriptions'> | null> {
  const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  let workspaceId = subscription.metadata.workspace_id || workspaceHint || null;
  if (!workspaceId) {
    const { data } = await admin.from('billing_subscriptions').select('workspace_id').eq('stripe_customer_id', customerId).maybeSingle();
    workspaceId = data?.workspace_id ?? null;
  }
  if (!workspaceId) {
    log.warn({ subscription: subscription.id, customer: customerId }, 'Stripe subscription without a Talkzi workspace');
    return null;
  }

  const { data: existing } = await admin
    .from('billing_subscriptions')
    .select('plan, status, stripe_subscription_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const row = subscriptionToRow(subscription, workspaceId);
  const live = row.status === 'active' || row.status === 'trialing' || row.status === 'past_due';
  if (existing && existing.stripe_subscription_id !== subscription.id && !live) {
    log.info({ subscription: subscription.id, workspaceId, status: row.status }, 'Ignoring Stripe subscription that is neither current nor live');
    return null;
  }

  const { error } = await admin.from('billing_subscriptions').upsert(row, { onConflict: 'workspace_id' });
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', `Could not save the subscription: ${error.message}`);
  if (!existing || existing.plan !== row.plan || existing.status !== row.status) {
    await audit({
      workspaceId,
      actorType: 'webhook',
      action: 'billing.subscription_changed',
      targetType: 'billing_subscription',
      targetId: subscription.id,
      metadata: { from: existing ? { plan: existing.plan, status: existing.status } : null, to: { plan: row.plan, status: row.status } },
    });
  }
  return row;
}

/** Applies one verified Stripe event. Subscriptions are re-read from Stripe so out-of-order events can't regress state. */
export async function handleStripeEvent(
  event: Stripe.Event,
  deps: { stripe: Stripe; admin: TypedSupabaseClient; log: Logger },
): Promise<'processed' | 'ignored'> {
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode !== 'subscription' || !session.subscription) return 'ignored';
      const id = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
      await syncSubscription(deps.admin, await deps.stripe.subscriptions.retrieve(id), deps.log, session.client_reference_id ?? undefined);
      return 'processed';
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
    case 'customer.subscription.paused':
    case 'customer.subscription.resumed':
      await syncSubscription(deps.admin, await deps.stripe.subscriptions.retrieve(event.data.object.id), deps.log);
      return 'processed';
    case 'invoice.payment_failed':
      deps.log.warn({ invoice: event.data.object.id, customer: event.data.object.customer }, 'Stripe invoice payment failed');
      return 'processed';
    default:
      return 'ignored';
  }
}
