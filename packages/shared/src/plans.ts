/**
 * Talkzi subscription plans. Meta's WhatsApp messaging fees are billed by Meta
 * separately (pass-through) and are NOT included in these prices.
 */
export type PlanId = 'free' | 'pro' | 'agency';
export type Currency = 'USD' | 'PKR';
export type BillingInterval = 'month' | 'year';

export type PlanFeature =
  | 'shared_inbox'
  | 'broadcasts'
  | 'chatbots'
  | 'ai_inbox'
  | 'api_access'
  | 'webhooks'
  | 'integrations'
  | 'white_label'
  | 'custom_domain'
  | 'sub_accounts'
  | 'priority_support'
  | 'analytics_advanced';

export type PlanLimit =
  | 'seats'
  | 'phone_numbers'
  | 'contacts'
  | 'messages_per_month'
  | 'broadcast_recipients_per_month'
  | 'chatbots'
  | 'ai_credits_per_month'
  | 'client_workspaces';

export interface Plan {
  id: PlanId;
  name: string;
  tagline: string;
  /** Monthly price when billed monthly / per month when billed yearly. */
  price: Record<Currency, { month: number; year: number }>;
  limits: Record<PlanLimit, number>;
  features: PlanFeature[];
  highlights: string[];
  popular?: boolean;
}

export const UNLIMITED = Number.POSITIVE_INFINITY;

export const PLANS: Record<PlanId, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'For trying Talkzi with your first number.',
    price: { USD: { month: 0, year: 0 }, PKR: { month: 0, year: 0 } },
    limits: {
      seats: 2,
      phone_numbers: 1,
      contacts: 500,
      messages_per_month: 1_000,
      broadcast_recipients_per_month: 250,
      chatbots: 1,
      ai_credits_per_month: 50,
      client_workspaces: 0,
    },
    features: ['shared_inbox', 'broadcasts', 'chatbots'],
    highlights: [
      '1 WhatsApp number',
      '2 team members',
      '500 contacts',
      'Shared inbox + 1 chatbot',
      '50 AI credits / month',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'For growing teams selling and supporting on WhatsApp.',
    price: { USD: { month: 29, year: 24 }, PKR: { month: 7_999, year: 6_499 } },
    limits: {
      seats: 10,
      phone_numbers: 3,
      contacts: 25_000,
      messages_per_month: 50_000,
      broadcast_recipients_per_month: 25_000,
      chatbots: 10,
      ai_credits_per_month: 2_000,
      client_workspaces: 0,
    },
    features: [
      'shared_inbox',
      'broadcasts',
      'chatbots',
      'ai_inbox',
      'api_access',
      'webhooks',
      'integrations',
      'analytics_advanced',
    ],
    highlights: [
      '3 WhatsApp numbers',
      '10 team members',
      '25,000 contacts',
      'Unlimited broadcasts & 10 chatbots',
      'AI inbox (2,000 credits / month)',
      'REST API, webhooks & integrations',
    ],
    popular: true,
  },
  agency: {
    id: 'agency',
    name: 'Agency',
    tagline: 'For agencies running WhatsApp for many brands.',
    price: { USD: { month: 99, year: 79 }, PKR: { month: 27_999, year: 22_499 } },
    limits: {
      seats: 50,
      phone_numbers: 10,
      contacts: 100_000,
      messages_per_month: 250_000,
      broadcast_recipients_per_month: 150_000,
      chatbots: UNLIMITED,
      ai_credits_per_month: 10_000,
      client_workspaces: UNLIMITED,
    },
    features: [
      'shared_inbox',
      'broadcasts',
      'chatbots',
      'ai_inbox',
      'api_access',
      'webhooks',
      'integrations',
      'analytics_advanced',
      'white_label',
      'custom_domain',
      'sub_accounts',
      'priority_support',
    ],
    highlights: [
      'Everything in Pro',
      'Unlimited client workspaces',
      'White-label branding + custom domain',
      '10 numbers · 50 team members',
      '10,000 AI credits / month',
      'Priority support',
    ],
  },
};

export const PLAN_ORDER: PlanId[] = ['free', 'pro', 'agency'];

export function planHasFeature(plan: PlanId, feature: PlanFeature): boolean {
  return PLANS[plan].features.includes(feature);
}

export function planLimit(plan: PlanId, limit: PlanLimit): number {
  return PLANS[plan].limits[limit];
}

/** Lowest plan that unlocks a feature (for upgrade prompts). */
export function minimumPlanFor(feature: PlanFeature): PlanId {
  return PLAN_ORDER.find((id) => planHasFeature(id, feature)) ?? 'agency';
}

export function formatPrice(amount: number, currency: Currency): string {
  if (amount === 0) return currency === 'PKR' ? 'Rs 0' : '$0';
  return currency === 'PKR'
    ? `Rs ${amount.toLocaleString('en-PK')}`
    : `$${amount.toLocaleString('en-US')}`;
}

/** Stripe price lookup keys, e.g. talkzi_pro_month_usd. Create these in Stripe. */
export function stripeLookupKey(plan: Exclude<PlanId, 'free'>, interval: BillingInterval, currency: Currency): string {
  return `talkzi_${plan}_${interval}_${currency.toLowerCase()}`;
}
