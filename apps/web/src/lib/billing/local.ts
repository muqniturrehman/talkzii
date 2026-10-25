import 'server-only';
import { createCipheriv, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { LocalPaymentProvider } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { configured, env } from '@/lib/env';

/**
 * Pakistani wallet adapters (prepaid periods, no auto-renewal).
 *
 * JazzCash: Page Redirection v1.1 — fields are signed with HMAC-SHA256 over the
 * sorted pp* values using the integrity salt, and the return POST carries the
 * same signature, so a successful callback activates the plan.
 *
 * Easypaisa: hosted checkout — the request is AES-128-ECB encrypted with the
 * store hash key. The final redirect is unsigned, so it only records the
 * payment as `pending_verification`; confirming it with Easypaisa's
 * transaction inquiry API is left as a stub (see README).
 *
 * Both follow the providers' published integration guides; verify field
 * formats against your merchant onboarding pack before going live.
 */

export const JAZZCASH_SANDBOX_URL = 'https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/';
export const EASYPAISA_SANDBOX_URL = 'https://easypaystg.easypaisa.com.pk/easypay/Index.jsf';

export interface CheckoutForm {
  action: string;
  method: 'POST';
  fields: Record<string, string>;
}

/** yyyyMMddHHmmss in Pakistan Standard Time (UTC+5, no daylight saving). */
export function pktTimestamp(date: Date): string {
  return new Date(date.getTime() + 5 * 3_600_000).toISOString().replace(/[-:T]/g, '').slice(0, 14);
}

/** Order reference accepted by both gateways (≤ 20 alphanumeric characters). */
export function paymentReference(now = new Date()): string {
  return `TZ${pktTimestamp(now)}${String(randomInt(10_000)).padStart(4, '0')}`;
}

export function localProviderConfigured(provider: LocalPaymentProvider): boolean {
  return provider === 'jazzcash' ? configured.jazzcash() && Boolean(env().JAZZCASH_PASSWORD) : configured.easypaisa();
}

// ---------------------------------------------------------------------------
// JazzCash
// ---------------------------------------------------------------------------

/** pp_SecureHash: HMAC-SHA256(salt, salt & sorted non-empty pp* values), uppercase hex. */
export function jazzcashSecureHash(fields: Record<string, string>, integritySalt: string): string {
  const values = Object.keys(fields)
    .filter((key) => key.toLowerCase().startsWith('pp') && key !== 'pp_SecureHash' && fields[key] !== '')
    .sort()
    .map((key) => fields[key]);
  return createHmac('sha256', integritySalt).update([integritySalt, ...values].join('&')).digest('hex').toUpperCase();
}

export function verifyJazzcashCallback(fields: Record<string, string>, integritySalt: string): boolean {
  const given = Buffer.from((fields.pp_SecureHash ?? '').toUpperCase());
  const expected = Buffer.from(jazzcashSecureHash(fields, integritySalt));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The browser posts these fields to JazzCash; the integrity salt never leaves the server. */
export function buildJazzcashCheckout(
  input: { reference: string; amountPkr: number; description: string; returnUrl: string; now?: Date },
  config: { merchantId: string; password: string; integritySalt: string; checkoutUrl?: string },
): CheckoutForm {
  const now = input.now ?? new Date();
  const fields: Record<string, string> = {
    pp_Version: '1.1',
    pp_TxnType: '',
    pp_Language: 'EN',
    pp_MerchantID: config.merchantId,
    pp_SubMerchantID: '',
    pp_Password: config.password,
    pp_BankID: '',
    pp_ProductID: '',
    pp_TxnRefNo: input.reference,
    pp_Amount: String(Math.round(input.amountPkr * 100)),
    pp_TxnCurrency: 'PKR',
    pp_TxnDateTime: pktTimestamp(now),
    pp_BillReference: 'talkzi',
    pp_Description: input.description.replace(/[^A-Za-z0-9 ]/g, '').slice(0, 100),
    pp_TxnExpiryDateTime: pktTimestamp(new Date(now.getTime() + 24 * 3_600_000)),
    pp_ReturnURL: input.returnUrl,
  };
  fields.pp_SecureHash = jazzcashSecureHash(fields, config.integritySalt);
  return { action: config.checkoutUrl ?? JAZZCASH_SANDBOX_URL, method: 'POST', fields };
}

// ---------------------------------------------------------------------------
// Easypaisa
// ---------------------------------------------------------------------------

/** merchantHashedReq: base64(AES-128-ECB(hashKey, sorted "key=value" pairs joined by &)). */
export function easypaisaHashedRequest(params: Record<string, string>, hashKey: string): string {
  const key = Buffer.from(hashKey, 'utf8');
  if (key.length !== 16) throw ApiError.notConfigured('Easypaisa (EASYPAISA_HASH_KEY must be 16 characters)');
  const plain = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join('&');
  const cipher = createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('base64');
}

export function buildEasypaisaCheckout(
  input: { reference: string; amountPkr: number; postBackUrl: string; email?: string | null; now?: Date },
  config: { storeId: string; hashKey: string; checkoutUrl?: string },
): CheckoutForm {
  const expiry = pktTimestamp(new Date((input.now ?? new Date()).getTime() + 24 * 3_600_000));
  const params: Record<string, string> = {
    amount: input.amountPkr.toFixed(1),
    autoRedirect: '1',
    expiryDate: `${expiry.slice(0, 8)} ${expiry.slice(8)}`,
    orderRefNum: input.reference,
    paymentMethod: 'MA_PAYMENT_METHOD',
    postBackURL: input.postBackUrl,
    storeId: config.storeId,
    ...(input.email ? { emailAddr: input.email } : {}),
  };
  return {
    action: config.checkoutUrl ?? EASYPAISA_SANDBOX_URL,
    method: 'POST',
    fields: { ...params, merchantHashedReq: easypaisaHashedRequest(params, config.hashKey) },
  };
}

/** Second leg of the Easypaisa redirect: post the auth token back to Confirm.jsf. */
export function easypaisaConfirmForm(authToken: string, postBackUrl: string, checkoutUrl = EASYPAISA_SANDBOX_URL): CheckoutForm {
  return { action: checkoutUrl.replace(/Index\.jsf$/, 'Confirm.jsf'), method: 'POST', fields: { auth_token: authToken, postBackURL: postBackUrl } };
}

/** Minimal page that submits a form to the gateway (with a button when scripts are off). */
export function autoSubmitPage(form: CheckoutForm, title = 'Redirecting to payment…'): string {
  const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inputs = Object.entries(form.fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#0A0A0F;color:#fff">
<form id="pay" method="POST" action="${esc(form.action)}">${inputs}<p>${esc(title)}</p><noscript><button type="submit">Continue</button></noscript></form>
<script>document.getElementById('pay').submit()</script></body></html>`;
}
