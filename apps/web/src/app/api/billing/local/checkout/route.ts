import { LOCAL_PROVIDER_META, localCheckoutSchema, periodPrice, PLANS } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { buildEasypaisaCheckout, buildJazzcashCheckout, localProviderConfigured, paymentReference } from '@/lib/billing/local';
import { assertBillable, loadSubscription } from '@/lib/billing/subscription';
import { appUrl, env } from '@/lib/env';

/**
 * Creates a pending wallet order and returns the signed form the browser
 * posts to JazzCash / Easypaisa. A paid order buys one prepaid month or year.
 */
export const POST = createHandler(
  { role: 'admin', body: localCheckoutSchema, rateLimit: { prefix: 'billing', limit: 10, windowSeconds: 60 } },
  async ({ body, workspace, user, admin }) => {
    assertBillable(workspace);
    const label = LOCAL_PROVIDER_META[body.provider].label;
    if (!localProviderConfigured(body.provider)) throw ApiError.notConfigured(label);

    const db = admin();
    const current = await loadSubscription(db, workspace.id, workspace.plan);
    if (current.stripeSubscriptionId) {
      throw ApiError.conflict('You pay by card. Cancel the card subscription in Manage billing before switching to a wallet.');
    }

    const amount = periodPrice(body.plan, body.interval, 'PKR');
    const reference = paymentReference();
    const { error } = await db.from('billing_payments').insert({
      workspace_id: workspace.id,
      provider: body.provider,
      reference,
      plan: body.plan,
      billing_interval: body.interval,
      amount,
      currency: 'pkr',
      created_by: user.id,
    });
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', 'Could not start the payment.');

    const e = env();
    const description = `Talkzi ${PLANS[body.plan].name} ${body.interval === 'year' ? 'yearly' : 'monthly'}`;
    const form =
      body.provider === 'jazzcash'
        ? buildJazzcashCheckout(
            { reference, amountPkr: amount, description, returnUrl: `${appUrl()}/api/billing/jazzcash/callback` },
            { merchantId: e.JAZZCASH_MERCHANT_ID!, password: e.JAZZCASH_PASSWORD!, integritySalt: e.JAZZCASH_INTEGRITY_SALT!, checkoutUrl: e.JAZZCASH_CHECKOUT_URL },
          )
        : buildEasypaisaCheckout(
            { reference, amountPkr: amount, postBackUrl: `${appUrl()}/api/billing/easypaisa/callback`, email: user.email },
            { storeId: e.EASYPAISA_STORE_ID!, hashKey: e.EASYPAISA_HASH_KEY!, checkoutUrl: e.EASYPAISA_CHECKOUT_URL },
          );
    return { reference, amount, ...form };
  },
);
