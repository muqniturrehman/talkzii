import { describe, expect, it } from 'vitest';
import { parseLookupKey, periodPrice, PLANS, stripeLookupKey, yearlySavingPercent } from '../src';

describe('plans & Stripe lookup keys', () => {
  it('round-trips lookup keys and rejects foreign prices', () => {
    expect(stripeLookupKey('agency', 'year', 'PKR')).toBe('talkzi_agency_year_pkr');
    expect(parseLookupKey('talkzi_agency_year_pkr')).toEqual({ plan: 'agency', interval: 'year', currency: 'PKR' });
    expect(parseLookupKey('talkzi_free_month_usd')).toBeNull();
    expect(parseLookupKey('pro_monthly')).toBeNull();
    expect(parseLookupKey(null)).toBeNull();
  });

  it('charges one month, or twelve discounted months for yearly', () => {
    expect(periodPrice('pro', 'month', 'USD')).toBe(PLANS.pro.price.USD.month);
    expect(periodPrice('pro', 'year', 'PKR')).toBe(PLANS.pro.price.PKR.year * 12);
    expect(periodPrice('free', 'year', 'USD')).toBe(0);
    expect(yearlySavingPercent('pro', 'USD')).toBe(17);
    expect(yearlySavingPercent('free', 'USD')).toBe(0);
  });
});

describe('white-label helpers', () => {
  it('computes WCAG contrast and picks readable text', async () => {
    const { contrastRatio, readableTextOn, customDomainSchema } = await import('../src');
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(contrastRatio('#6d28d9', '#ffffff')).toBeGreaterThan(4.5);
    expect(readableTextOn('#facc15')).toBe('#0a0a0f');
    expect(readableTextOn('#6d28d9')).toBe('#ffffff');
    expect(customDomainSchema.parse(' App.Agency.COM ')).toBe('app.agency.com');
    for (const bad of ['agency', 'https://app.agency.com', 'app.agency.com/login', '-bad.agency.com', 'app..agency.com']) {
      expect(customDomainSchema.safeParse(bad).success, bad).toBe(false);
    }
  });
});
