'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Check, CreditCard, ExternalLink, Infinity as InfinityIcon, Smartphone, Wallet } from 'lucide-react';
import {
  formatPrice,
  LOCAL_PROVIDER_META,
  periodPrice,
  PLAN_ORDER,
  PLANS,
  yearlySavingPercent,
  type BillingInterval,
  type Currency,
  type LocalPaymentProvider,
  type PaidPlanId,
  type PlanId,
} from '@talkzi/shared';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talkzi/ui/dialog';
import { Progress } from '@talkzi/ui/progress';
import { RadioGroup, RadioGroupItem } from '@talkzi/ui/radio-group';
import { SegmentedControl } from '@talkzi/ui/segmented-control';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { apiFetch } from '@/lib/api/client';
import type { SubscriptionSummary } from '@/lib/billing/subscription';
import type { UsageItem } from '@/lib/billing/usage';

export interface BillingPayment {
  id: string;
  provider: string;
  reference: string;
  plan: string;
  billing_interval: string;
  amount: number;
  status: string;
  created_at: string;
}

interface Providers {
  stripe: boolean;
  jazzcash: boolean;
  easypaisa: boolean;
}

type PaymentMethod = 'card' | LocalPaymentProvider;
type CheckoutForm = { action: string; fields: Record<string, string> };

const dateFmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' | 'info' }> = {
  active: { label: 'Active', variant: 'success' },
  trialing: { label: 'Trial', variant: 'info' },
  past_due: { label: 'Payment overdue', variant: 'danger' },
  incomplete: { label: 'Incomplete', variant: 'warning' },
  unpaid: { label: 'Unpaid', variant: 'danger' },
  canceled: { label: 'Canceled', variant: 'secondary' },
};

const PAYMENT_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  paid: { label: 'Paid', variant: 'success' },
  pending: { label: 'Not completed', variant: 'secondary' },
  pending_verification: { label: 'Confirming', variant: 'warning' },
  failed: { label: 'Failed', variant: 'danger' },
  expired: { label: 'Expired', variant: 'secondary' },
};

/** Posts the signed wallet fields from the browser, as the gateways require. */
function submitGatewayForm({ action, fields }: CheckoutForm) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = action;
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }
  document.body.appendChild(form);
  form.submit();
}

function ReturnBanner({ notice, onDismiss }: { notice: { kind: string; provider?: string; reason?: string }; onDismiss: () => void }) {
  const provider = notice.provider === 'jazzcash' ? 'JazzCash' : notice.provider === 'easypaisa' ? 'Easypaisa' : 'Stripe';
  const content =
    notice.kind === 'checkout-success'
      ? { variant: 'success' as const, title: 'Payment received', body: 'Your plan updates as soon as Stripe confirms the subscription — usually within a few seconds.' }
      : notice.kind === 'checkout-canceled'
        ? { variant: 'info' as const, title: 'Checkout canceled', body: 'You have not been charged.' }
        : notice.kind === 'payment-success'
          ? { variant: 'success' as const, title: `${provider} payment received`, body: 'Your prepaid plan is active.' }
          : notice.kind === 'payment-pending'
            ? { variant: 'warning' as const, title: `${provider} payment received`, body: 'We are confirming it with the provider; your plan is activated once it clears.' }
            : { variant: 'danger' as const, title: `${provider} payment failed`, body: notice.reason ?? 'The payment was not completed. You have not been charged.' };
  return (
    <Alert variant={content.variant} className="flex items-start justify-between gap-3">
      <div>
        <AlertTitle>{content.title}</AlertTitle>
        <AlertDescription>{content.body}</AlertDescription>
      </div>
      <Button size="sm" variant="ghost" onClick={onDismiss}>
        Dismiss
      </Button>
    </Alert>
  );
}

function UsageMeter({ item }: { item: UsageItem }) {
  const ratio = item.limit ? item.used / item.limit : 0;
  const full = item.limit !== null && item.used >= item.limit;
  const near = !full && item.limit !== null && ratio >= 0.8;
  return (
    <li className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span>
          {item.label}
          {item.monthly ? <span className="text-muted-foreground"> · this month</span> : null}
        </span>
        <span className="text-muted-foreground tabular-nums">
          {item.used.toLocaleString()} /{' '}
          {item.limit === null ? <InfinityIcon className="inline size-3.5 align-[-2px]" aria-label="unlimited" /> : item.limit.toLocaleString()}
        </span>
      </div>
      {item.limit === null ? (
        <p className="text-xs text-muted-foreground">Unlimited on your plan</p>
      ) : (
        <Progress
          value={Math.min(100, ratio * 100)}
          aria-label={`${item.label}: ${item.used} of ${item.limit}`}
          indicatorClassName={full ? 'bg-danger' : near ? 'bg-warning' : undefined}
        />
      )}
      {full || near ? (
        <p className={cn('flex items-center gap-1 text-xs', full ? 'text-danger' : 'text-warning')}>
          <AlertTriangle className="size-3.5" aria-hidden /> {full ? 'Limit reached' : 'Almost at the limit'}
        </p>
      ) : null}
    </li>
  );
}

export function BillingSettings({
  subscription,
  usage,
  payments,
  providers,
  billable,
  notice: initialNotice,
}: {
  subscription: SubscriptionSummary;
  usage: UsageItem[];
  payments: BillingPayment[];
  providers: Providers;
  billable: boolean;
  notice: { kind: string; provider?: string; reason?: string } | null;
}) {
  const router = useRouter();
  const [notice, setNotice] = React.useState(initialNotice);
  const subscribedCurrency: Currency | null = subscription.stripeSubscriptionId ? (subscription.currency?.toUpperCase() === 'PKR' ? 'PKR' : 'USD') : null;
  const [currency, setCurrency] = React.useState<Currency>(subscribedCurrency ?? (subscription.currency?.toUpperCase() === 'PKR' ? 'PKR' : 'USD'));
  const [interval, setBillingInterval] = React.useState<BillingInterval>(subscription.interval ?? 'month');
  const [choosing, setChoosing] = React.useState<PaidPlanId | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod>('card');

  // After Stripe checkout the webhook may land a moment later: poll until the
  // subscription changes, then reload the page data without the query string
  // (the banner lives in state, so it stays).
  React.useEffect(() => {
    if (initialNotice?.kind !== 'checkout-success') return;
    let tries = 0;
    const timer = window.setInterval(async () => {
      tries += 1;
      try {
        const next = await apiFetch<SubscriptionSummary>('/api/billing/subscription');
        if (next.plan !== subscription.plan || next.stripeSubscriptionId !== subscription.stripeSubscriptionId || tries >= 15) {
          window.clearInterval(timer);
          router.replace('/app/settings/billing', { scroll: false });
        }
      } catch {
        window.clearInterval(timer);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [initialNotice, subscription.plan, subscription.stripeSubscriptionId, router]);

  const dismissNotice = () => {
    setNotice(null);
    router.replace('/app/settings/billing', { scroll: false });
  };

  const portal = useMutation({
    mutationFn: () => apiFetch<{ url: string }>('/api/billing/stripe/portal', { method: 'POST' }),
    onSuccess: ({ url }) => window.location.assign(url),
    onError: (error) => toast.error(error.message),
  });

  const checkout = useMutation({
    mutationFn: async ({ plan, via }: { plan: PaidPlanId; via: PaymentMethod }) => {
      if (via === 'card') return { kind: 'stripe' as const, result: await apiFetch<{ switched: boolean; url: string | null }>('/api/billing/stripe/checkout', { body: { plan, interval, currency } }) };
      return { kind: 'wallet' as const, result: await apiFetch<CheckoutForm>('/api/billing/local/checkout', { body: { provider: via, plan, interval } }) };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === 'wallet') return submitGatewayForm(outcome.result);
      if (outcome.result.url) return window.location.assign(outcome.result.url);
      setChoosing(null);
      toast.success('Plan switched. Stripe prorates the difference on your next invoice.');
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });

  const walletMethods = (['jazzcash', 'easypaisa'] as const).filter((p) => providers[p] && currency === 'PKR' && !subscription.stripeSubscriptionId);
  const methods: PaymentMethod[] = [...(providers.stripe ? (['card'] as const) : []), ...walletMethods];
  const status = subscription.status ? STATUS_BADGE[subscription.status] : null;
  const prepaid = subscription.provider === 'jazzcash' || subscription.provider === 'easypaisa' || subscription.provider === 'manual';
  const planName = PLANS[subscription.plan].name;

  const startChoose = (plan: PaidPlanId) => {
    setMethod(methods[0] ?? 'card');
    setChoosing(plan);
  };

  let detail = 'You are on the Free plan.';
  if (subscription.plan !== 'free' && subscription.provider) {
    const cadence = subscription.interval === 'year' ? 'yearly' : 'monthly';
    if (prepaid) detail = `Prepaid ${cadence} via ${subscription.provider === 'manual' ? 'invoice' : LOCAL_PROVIDER_META[subscription.provider as LocalPaymentProvider].label} · ends ${dateFmt(subscription.currentPeriodEnd)}.`;
    else if (subscription.cancelAtPeriodEnd) detail = `Billed ${cadence} by card · cancels on ${dateFmt(subscription.currentPeriodEnd)}.`;
    else detail = `Billed ${cadence} by card · renews on ${dateFmt(subscription.currentPeriodEnd)}.`;
  }

  return (
    <div className="space-y-6">
      {notice ? <ReturnBanner notice={notice} onDismiss={dismissNotice} /> : null}

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-3 space-y-0">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {planName} plan {status && subscription.plan !== 'free' ? <Badge variant={status.variant}>{status.label}</Badge> : null}
            </CardTitle>
            <CardDescription>{billable ? detail : 'This client workspace is billed through its agency.'}</CardDescription>
          </div>
          {billable && providers.stripe && subscription.hasStripeCustomer ? (
            <Button variant="outline" onClick={() => portal.mutate()} loading={portal.isPending}>
              <ExternalLink /> Manage billing
            </Button>
          ) : null}
        </CardHeader>
        {subscription.status === 'past_due' || subscription.status === 'unpaid' ? (
          <CardContent>
            <Alert variant="danger">
              <AlertTriangle className="size-4" />
              <AlertDescription>Your last card payment failed. Update your payment method in Manage billing to keep {planName} features.</AlertDescription>
            </Alert>
          </CardContent>
        ) : null}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usage</CardTitle>
          <CardDescription>Monthly allowances reset on the 1st (UTC). Meta bills WhatsApp conversation fees separately.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
            {usage.map((item) => (
              <UsageMeter key={item.key} item={item} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {billable ? (
        <section aria-labelledby="plans-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="plans-heading" className="text-lg font-semibold">
              Plans
            </h2>
            <div className="flex flex-wrap gap-2">
              <SegmentedControl
                label="Billing interval"
                value={interval}
                onValueChange={setBillingInterval}
                options={[
                  { value: 'month', label: 'Monthly' },
                  { value: 'year', label: `Yearly · save ${yearlySavingPercent('pro', currency)}%` },
                ]}
              />
              <SegmentedControl
                label="Currency"
                value={currency}
                onValueChange={(next) => (subscribedCurrency && next !== subscribedCurrency ? toast.info(`Your card subscription is billed in ${subscribedCurrency}.`) : setCurrency(next))}
                options={[
                  { value: 'USD', label: 'USD' },
                  { value: 'PKR', label: 'PKR' },
                ]}
              />
            </div>
          </div>

          <ul className="grid gap-4 lg:grid-cols-3">
            {PLAN_ORDER.map((id: PlanId) => {
              const plan = PLANS[id];
              const current = id === subscription.plan && (id === 'free' || subscription.interval === interval);
              const perMonth = plan.price[currency][interval];
              return (
                <li key={id}>
                  <Card className={cn('flex h-full flex-col', plan.popular && 'border-primary/60')}>
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between">
                        {plan.name} {plan.popular ? <Badge>Popular</Badge> : null}
                      </CardTitle>
                      <CardDescription>{plan.tagline}</CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div>
                        <p className="text-3xl font-bold tabular-nums">
                          {formatPrice(perMonth, currency)}
                          <span className="text-sm font-normal text-muted-foreground"> / month</span>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {id === 'free' ? 'Free forever' : interval === 'year' ? `${formatPrice(periodPrice(id, 'year', currency), currency)} billed yearly` : 'Billed monthly'}
                        </p>
                      </div>
                      <ul className="flex-1 space-y-1.5 text-sm">
                        {plan.highlights.map((h) => (
                          <li key={h} className="flex gap-2">
                            <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {h}
                          </li>
                        ))}
                      </ul>
                      {current && prepaid && id !== 'free' ? (
                        <Button variant="outline" onClick={() => startChoose(id)} disabled={methods.length === 0}>
                          Extend by a {interval === 'year' ? 'year' : 'month'}
                        </Button>
                      ) : current ? (
                        <Button variant="outline" disabled>
                          Current plan
                        </Button>
                      ) : id === 'free' ? (
                        <p className="text-xs text-muted-foreground">
                          {subscription.stripeSubscriptionId
                            ? 'To move to Free, cancel your subscription in Manage billing.'
                            : prepaid
                              ? `You move to Free automatically when your prepaid period ends (${dateFmt(subscription.currentPeriodEnd)}).`
                              : 'Included with every workspace.'}
                        </p>
                      ) : (
                        <Button
                          onClick={() => startChoose(id)}
                          disabled={methods.length === 0}
                          title={methods.length === 0 ? `No ${currency} payment method is configured on this server` : undefined}
                        >
                          {PLAN_ORDER.indexOf(id) > PLAN_ORDER.indexOf(subscription.plan) ? `Upgrade to ${plan.name}` : `Switch to ${plan.name}`}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          {methods.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Payments aren’t configured on this server yet — add Stripe keys (USD/PKR cards) or JazzCash/Easypaisa credentials (PKR) to enable upgrades.
            </p>
          ) : null}
        </section>
      ) : null}

      {payments.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Wallet payments</CardTitle>
            <CardDescription>JazzCash and Easypaisa orders. Card invoices are in Manage billing.</CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Method</th>
                  <th className="py-2 pr-3 font-medium">Plan</th>
                  <th className="py-2 pr-3 font-medium">Amount</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Reference</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const s = PAYMENT_STATUS[p.status] ?? { label: p.status, variant: 'secondary' as const };
                  return (
                    <tr key={p.id} className="border-t border-border">
                      <td className="py-2 pr-3 tabular-nums">{dateFmt(p.created_at)}</td>
                      <td className="py-2 pr-3">{LOCAL_PROVIDER_META[p.provider as LocalPaymentProvider]?.label ?? p.provider}</td>
                      <td className="py-2 pr-3">
                        {PLANS[p.plan as PlanId]?.name ?? p.plan} · {p.billing_interval === 'year' ? 'yearly' : 'monthly'}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{formatPrice(Number(p.amount), 'PKR')}</td>
                      <td className="py-2 pr-3">
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{p.reference}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={choosing !== null} onOpenChange={(open) => !open && setChoosing(null)}>
        <DialogContent className="sm:max-w-md">
          {choosing ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  {PLANS[choosing].name} · {interval === 'year' ? 'yearly' : 'monthly'}
                </DialogTitle>
                <DialogDescription>
                  {formatPrice(periodPrice(choosing, interval, currency), currency)} {interval === 'year' ? 'per year' : 'per month'}.{' '}
                  {subscription.stripeSubscriptionId
                    ? 'Your card subscription switches now; Stripe charges or credits the prorated difference.'
                    : method === 'card'
                      ? 'Renews automatically until you cancel.'
                      : 'Prepaid — no automatic renewal. Paying again extends your plan.'}
                </DialogDescription>
              </DialogHeader>
              {methods.length > 1 ? (
                <RadioGroup value={method} onValueChange={(v) => setMethod(v as PaymentMethod)} aria-label="Payment method" className="gap-2">
                  {methods.map((m) => {
                    const Icon = m === 'card' ? CreditCard : m === 'jazzcash' ? Wallet : Smartphone;
                    return (
                      <label key={m} className={cn('flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3', method === m && 'border-primary')}>
                        <RadioGroupItem value={m} />
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        <span className="text-sm">
                          <span className="font-medium">{m === 'card' ? 'Card' : LOCAL_PROVIDER_META[m].label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {m === 'card' ? `Visa / Mastercard via Stripe (${currency})` : LOCAL_PROVIDER_META[m].description}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </RadioGroup>
              ) : null}
              {prepaid && subscription.plan !== 'free' && method === 'card' ? (
                <p className="text-xs text-muted-foreground">Starting a card subscription replaces your prepaid plan; unused prepaid time isn’t refunded automatically.</p>
              ) : null}
              <DialogFooter>
                <Button variant="outline" onClick={() => setChoosing(null)}>
                  Cancel
                </Button>
                <Button onClick={() => checkout.mutate({ plan: choosing, via: method })} loading={checkout.isPending}>
                  {subscription.stripeSubscriptionId ? 'Switch plan' : method === 'card' ? 'Continue to checkout' : `Pay with ${LOCAL_PROVIDER_META[method].label}`}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
