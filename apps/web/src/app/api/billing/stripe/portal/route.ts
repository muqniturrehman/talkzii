import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { createPortalSession, getStripe, toPaymentError } from '@/lib/billing/stripe';
import { assertBillable } from '@/lib/billing/subscription';

/** Stripe customer portal: payment methods, invoices, plan changes and cancellation. */
export const POST = createHandler({ role: 'admin' }, async ({ workspace, admin }) => {
  assertBillable(workspace);
  const stripe = getStripe();
  const { data } = await admin().from('billing_subscriptions').select('stripe_customer_id').eq('workspace_id', workspace.id).maybeSingle();
  if (!data?.stripe_customer_id) throw ApiError.conflict('There is no card billing for this workspace yet. Pick a plan first.');
  try {
    return { url: await createPortalSession(stripe, data.stripe_customer_id) };
  } catch (error) {
    throw toPaymentError(error);
  }
});
