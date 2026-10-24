/**
 * WhatsApp Business Platform per-message rates (USD) used for estimates.
 * Meta bills marketing, utility and authentication templates per delivered
 * message; service replies inside the 24h window are free, as are utility
 * templates sent inside an open customer service window.
 *
 * Approximate Pakistan rates — update from
 * https://developers.facebook.com/docs/whatsapp/pricing when Meta changes them.
 */
export type PricingCategory = 'marketing' | 'utility' | 'authentication' | 'service';

export const DEFAULT_RATE_CARD: Record<PricingCategory, number> = {
  marketing: 0.0473,
  utility: 0.0054,
  authentication: 0.0054,
  service: 0,
};

/** Display conversion for PKR estimates (approximate). */
export const USD_TO_PKR = 280;

export function templateCategoryToPricing(category: string | null | undefined): PricingCategory {
  switch ((category ?? '').toUpperCase()) {
    case 'MARKETING':
      return 'marketing';
    case 'AUTHENTICATION':
      return 'authentication';
    case 'UTILITY':
      return 'utility';
    default:
      return 'service';
  }
}

export function estimateCost(count: number, category: PricingCategory, rates: Record<PricingCategory, number> = DEFAULT_RATE_CARD): number {
  return Math.round(count * (rates[category] ?? 0) * 10_000) / 10_000;
}
