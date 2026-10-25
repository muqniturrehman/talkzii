import type { Metadata } from 'next';
import { BillingSettings, type BillingPayment } from '@/components/app/settings/billing-settings';
import { requireRole } from '@/lib/auth/session';
import { localProviderConfigured } from '@/lib/billing/local';
import { loadSubscription } from '@/lib/billing/subscription';
import { loadUsage } from '@/lib/billing/usage';
import { configured } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Billing' };

type Search = { checkout?: string; payment?: string; provider?: string; reason?: string };

function noticeFrom(search: Search) {
  if (search.checkout === 'success' || search.checkout === 'canceled') return { kind: `checkout-${search.checkout}` };
  if (search.payment && ['success', 'pending', 'failed'].includes(search.payment)) {
    return { kind: `payment-${search.payment}`, provider: search.provider, reason: search.reason?.slice(0, 200) };
  }
  return null;
}

export default async function BillingSettingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireRole('admin', '/app/settings/billing');
  const ws = session.workspace;
  const [supabase, search] = await Promise.all([createSupabaseServerClient(), searchParams]);
  const [subscription, usage, payments] = await Promise.all([
    loadSubscription(supabase, ws.id, ws.plan),
    loadUsage(createSupabaseAdminClient(), ws.id, ws.plan),
    supabase
      .from('billing_payments')
      .select('id, provider, reference, plan, billing_interval, amount, status, created_at')
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(12),
  ]);

  return (
    <BillingSettings
      subscription={subscription}
      usage={usage}
      payments={(payments.data ?? []) as BillingPayment[]}
      providers={{ stripe: configured.stripe(), jazzcash: localProviderConfigured('jazzcash'), easypaisa: localProviderConfigured('easypaisa') }}
      billable={!ws.parent_workspace_id}
      notice={noticeFrom(search)}
    />
  );
}
