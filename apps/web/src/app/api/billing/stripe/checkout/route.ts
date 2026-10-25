import { stripeCheckoutSchema } from '@talkzi/shared';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { createCheckoutSession, ensureStripeCustomer, getStripe, switchSubscriptionPlan, syncSubscription, toPaymentError } from '@/lib/billing/stripe';
import { assertBillable, loadSubscription } from '@/lib/billing/subscription';

/**
 * Starts a Stripe Checkout for a paid plan, or — when the workspace already
 * has a live Stripe subscription — switches that subscription's plan with
 * proration (no second subscription is ever created).
 */
export const POST = createHandler(
  { role: 'admin', body: stripeCheckoutSchema, rateLimit: { prefix: 'billing', limit: 10, windowSeconds: 60 } },
  async ({ body, workspace, user, admin, log, req }) => {
    assertBillable(workspace);
    const stripe = getStripe();
    const db = admin();
    const current = await loadSubscription(db, workspace.id, workspace.plan);
    try {
      if (current.stripeSubscriptionId) {
        const updated = await switchSubscriptionPlan(stripe, current.stripeSubscriptionId, body);
        await syncSubscription(db, updated, log, workspace.id);
        await audit({ workspaceId: workspace.id, actorId: user.id, action: 'billing.plan_switched', metadata: { ...body }, req });
        return { switched: true as const, url: null };
      }
      const customerId = await ensureStripeCustomer(stripe, db, workspace, user.email);
      const url = await createCheckoutSession(stripe, { workspaceId: workspace.id, customerId, ...body });
      return { switched: false as const, url };
    } catch (error) {
      throw toPaymentError(error);
    }
  },
);
