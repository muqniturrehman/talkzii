import 'server-only';
import type { PlanId } from '@talkzi/shared';
import type { Enums } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

export type BillingProviderId = 'stripe' | 'jazzcash' | 'easypaisa' | 'manual';

export interface SubscriptionSummary {
  /** Effective plan (mirrors workspaces.plan). */
  plan: PlanId;
  provider: BillingProviderId | null;
  status: Enums<'subscription_status'> | null;
  interval: 'month' | 'year' | null;
  currency: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  trialEndsAt: string | null;
  hasStripeCustomer: boolean;
  /** A live Stripe subscription: plan changes go through Stripe, not a new checkout. */
  stripeSubscriptionId: string | null;
}

const LIVE = new Set(['active', 'trialing', 'past_due']);

export async function loadSubscription(db: TypedSupabaseClient, workspaceId: string, plan: PlanId): Promise<SubscriptionSummary> {
  const { data: row } = await db
    .from('billing_subscriptions')
    .select('provider, plan, status, billing_interval, currency, current_period_end, cancel_at_period_end, trial_ends_at, stripe_customer_id, stripe_subscription_id')
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  const live = Boolean(row && LIVE.has(row.status));
  return {
    plan,
    provider: (row?.provider as BillingProviderId | undefined) ?? null,
    status: row?.status ?? null,
    interval: row?.billing_interval === 'year' ? 'year' : row?.billing_interval === 'month' ? 'month' : null,
    currency: row?.currency ?? null,
    currentPeriodEnd: row?.current_period_end ?? null,
    cancelAtPeriodEnd: row?.cancel_at_period_end ?? false,
    trialEndsAt: row?.trial_ends_at ?? null,
    hasStripeCustomer: Boolean(row?.stripe_customer_id),
    stripeSubscriptionId: live && row?.provider === 'stripe' ? (row.stripe_subscription_id ?? null) : null,
  };
}

/** Client workspaces of an agency inherit its plan and are not billed separately. */
export function assertBillable(workspace: { parentWorkspaceId: string | null }) {
  if (workspace.parentWorkspaceId) throw ApiError.conflict('This client workspace is billed through its agency.');
}
