import { z } from 'zod';

export const BILLING_INTERVALS = ['month', 'year'] as const;
export const CURRENCIES = ['USD', 'PKR'] as const;
export const PAID_PLANS = ['pro', 'agency'] as const;
export const LOCAL_PAYMENT_PROVIDERS = ['jazzcash', 'easypaisa'] as const;
export type LocalPaymentProvider = (typeof LOCAL_PAYMENT_PROVIDERS)[number];

/** Card checkout (Stripe) — also used to switch an existing Stripe subscription's plan. */
export const stripeCheckoutSchema = z.object({
  plan: z.enum(PAID_PLANS),
  interval: z.enum(BILLING_INTERVALS),
  currency: z.enum(CURRENCIES).default('USD'),
});
export type StripeCheckoutInput = z.infer<typeof stripeCheckoutSchema>;

/** Prepaid month/year through a Pakistani wallet (PKR only, no auto-renewal). */
export const localCheckoutSchema = z.object({
  provider: z.enum(LOCAL_PAYMENT_PROVIDERS),
  plan: z.enum(PAID_PLANS),
  interval: z.enum(BILLING_INTERVALS),
});
export type LocalCheckoutInput = z.infer<typeof localCheckoutSchema>;

export const LOCAL_PROVIDER_META: Record<LocalPaymentProvider, { label: string; description: string }> = {
  jazzcash: { label: 'JazzCash', description: 'Mobile wallet, card or voucher via JazzCash' },
  easypaisa: { label: 'Easypaisa', description: 'Easypaisa mobile account' },
};
