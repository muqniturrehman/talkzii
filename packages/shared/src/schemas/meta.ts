import { z } from 'zod';

const metaId = z.string().regex(/^\d{5,25}$/, 'Expected a numeric Meta id');
const pin = z.string().regex(/^\d{6}$/, 'PIN must be exactly 6 digits');

/** POST /api/meta/exchange-code — payload from the Embedded Signup popup. */
export const exchangeCodeSchema = z.object({
  code: z.string().min(10).max(4096),
  wabaId: metaId.optional(),
  phoneNumberId: metaId.optional(),
  /** Two-step verification PIN used to register the number on the Cloud API. */
  pin: pin.optional(),
  /** App-scoped Facebook user id from FB.login, to honour Meta data deletion callbacks. */
  fbUserId: metaId.optional(),
});
export type ExchangeCodeInput = z.infer<typeof exchangeCodeSchema>;

/** Developer fallback: connect a WABA with your own System User token. */
export const manualConnectSchema = z.object({
  wabaId: metaId,
  accessToken: z.string().min(20).max(4096),
  pin: pin.optional(),
});
export type ManualConnectInput = z.infer<typeof manualConnectSchema>;

export const wabaActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('sync'), wabaAccountId: z.uuid() }),
  z.object({ action: z.literal('disconnect'), wabaAccountId: z.uuid() }),
]);
export type WabaActionInput = z.infer<typeof wabaActionSchema>;

export const BUSINESS_VERTICALS = [
  'UNDEFINED', 'OTHER', 'AUTO', 'BEAUTY', 'APPAREL', 'EDU', 'ENTERTAIN', 'EVENT_PLAN', 'FINANCE', 'GROCERY',
  'GOVT', 'HOTEL', 'HEALTH', 'NONPROFIT', 'PROF_SERVICES', 'RETAIL', 'TRAVEL', 'RESTAURANT', 'NOT_A_BIZ',
] as const;

export const businessProfileSchema = z.object({
  about: z.string().max(139).optional(),
  address: z.string().max(256).optional(),
  description: z.string().max(512).optional(),
  email: z.email().max(128).optional(),
  websites: z.array(z.url().max(256)).max(2).optional(),
  vertical: z.enum(BUSINESS_VERTICALS).optional(),
});

export const phoneNumberActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('register'), phoneNumberId: z.uuid(), pin }),
  z.object({ action: z.literal('request_code'), phoneNumberId: z.uuid(), method: z.enum(['SMS', 'VOICE']).default('SMS') }),
  z.object({ action: z.literal('verify_code'), phoneNumberId: z.uuid(), code: z.string().regex(/^\d{4,8}$/) }),
  z.object({
    action: z.literal('display_name'),
    phoneNumberId: z.uuid(),
    displayName: z.string().trim().min(3).max(100),
  }),
  z.object({ action: z.literal('set_default'), phoneNumberId: z.uuid() }),
  z.object({ action: z.literal('profile'), phoneNumberId: z.uuid(), profile: businessProfileSchema }),
]);
export type PhoneNumberActionInput = z.infer<typeof phoneNumberActionSchema>;
