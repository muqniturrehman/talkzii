import type { Metadata } from 'next';
import Link from 'next/link';
import { Building2, Plus, Smartphone } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { EmptyState } from '@talkzi/ui/empty-state';
import { PageHeader } from '@talkzi/ui/page-header';
import { QualityBadge, tierLabel } from '@/components/app/quality-badge';
import { PhoneNumberActions, WabaActions } from '@/components/app/sessions/number-actions';
import { requireRole } from '@/lib/auth/session';
import { timeAgo } from '@/lib/format';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'WhatsApp numbers' };

const NAME_STATUS: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'secondary' }> = {
  APPROVED: { label: 'Name approved', variant: 'success' },
  AVAILABLE_WITHOUT_REVIEW: { label: 'Name approved', variant: 'success' },
  PENDING_REVIEW: { label: 'Name in review', variant: 'warning' },
  DECLINED: { label: 'Name declined', variant: 'danger' },
  EXPIRED: { label: 'Name expired', variant: 'danger' },
};

export default async function SessionsPage() {
  const session = await requireRole('admin', '/app/sessions');
  const supabase = await createSupabaseServerClient();
  const [wabasRes, phonesRes] = await Promise.all([
    supabase
      .from('waba_accounts')
      .select('id, waba_id, name, status, account_review_status, business_verification_status, webhook_subscribed, last_synced_at, metadata')
      .eq('workspace_id', session.workspace.id)
      .order('created_at'),
    supabase.from('phone_numbers').select('*').eq('workspace_id', session.workspace.id).order('created_at'),
  ]);
  const wabas = wabasRes.data ?? [];
  const phones = phonesRes.data ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="WhatsApp numbers"
        description="Business accounts and phone numbers connected through Meta’s official Cloud API."
        actions={
          <Button asChild>
            <Link href="/app/sessions/connect">
              <Plus /> Connect WhatsApp
            </Link>
          </Button>
        }
      />

      {wabas.length === 0 ? (
        <EmptyState
          icon={<Smartphone />}
          title="No WhatsApp number connected"
          description="Connect your number with Meta Embedded Signup — it takes about two minutes and needs no developer."
          action={
            <Button asChild>
              <Link href="/app/sessions/connect">Connect WhatsApp</Link>
            </Button>
          }
        />
      ) : null}

      {wabas.map((waba) => {
        const numbers = phones.filter((p) => p.waba_account_id === waba.id);
        const mock = (waba.metadata as { mock?: boolean } | null)?.mock === true;
        return (
          <Card key={waba.id}>
            <CardHeader className="flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-primary/15 text-primary dark:text-accent">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <CardTitle className="flex flex-wrap items-center gap-2">
                    {waba.name ?? 'WhatsApp Business Account'}
                    {mock ? <Badge variant="info">Demo</Badge> : null}
                    <Badge variant={waba.status === 'connected' ? 'success' : 'danger'} className="capitalize">
                      {waba.status}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    WABA {waba.waba_id} · Review: {waba.account_review_status ?? 'pending'} · Webhooks{' '}
                    {waba.webhook_subscribed ? 'subscribed' : 'not subscribed'}
                    {waba.last_synced_at ? ` · Synced ${timeAgo(waba.last_synced_at)}` : ''}
                  </CardDescription>
                </div>
              </div>
              <WabaActions wabaAccountId={waba.id} disabled={waba.status !== 'connected'} />
            </CardHeader>
            <CardContent className="space-y-3">
              {numbers.length === 0 ? (
                <p className="text-sm text-muted-foreground">No phone numbers on this account yet.</p>
              ) : (
                numbers.map((phone) => {
                  const name = NAME_STATUS[phone.name_status ?? ''];
                  return (
                    <div
                      key={phone.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border p-4 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{phone.verified_name ?? phone.display_phone_number}</p>
                          {phone.is_default ? <Badge>Default</Badge> : null}
                          <Badge variant={phone.is_registered ? 'success' : 'warning'}>
                            {phone.is_registered ? 'Registered' : 'Not registered'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {phone.display_phone_number} · {tierLabel(phone.messaging_limit_tier)} · {phone.status}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          <QualityBadge rating={phone.quality_rating} />
                          {name ? <Badge variant={name.variant}>{name.label}</Badge> : null}
                          {phone.requested_display_name && phone.name_status === 'PENDING_REVIEW' ? (
                            <Badge variant="secondary">Requested: {phone.requested_display_name}</Badge>
                          ) : null}
                        </div>
                      </div>
                      <PhoneNumberActions
                        phoneNumberId={phone.id}
                        isRegistered={phone.is_registered}
                        isDefault={phone.is_default}
                        displayName={phone.verified_name}
                      />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
