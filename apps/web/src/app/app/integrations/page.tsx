import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { planHasFeature } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent } from '@talkzi/ui/card';
import { PageHeader } from '@talkzi/ui/page-header';
import { IntegrationsTabs, type IntegrationTab } from '@/components/app/integrations/integrations-tabs';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Integrations' };

// Kept here, not in the client module: values exported from 'use client' files are client references on the server.
const TABS: IntegrationTab[] = ['apps', 'webhooks', 'api-keys'];

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const session = await requireRole('admin', '/app/integrations');
  const { tab } = await searchParams;
  const initialTab: IntegrationTab = TABS.includes(tab as IntegrationTab) ? (tab as IntegrationTab) : 'apps';
  const allowed = planHasFeature(session.workspace.plan, 'integrations');

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Integrations" description="Connect your store and automation tools, receive signed webhooks and use the REST API." />
      {allowed ? (
        <IntegrationsTabs initialTab={initialTab} />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Lock className="size-6 text-primary" aria-hidden />
            <p className="font-medium">Integrations are part of Pro and Agency</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Connect Shopify, WooCommerce, Zapier and n8n, send events to your own systems with signed webhooks, and use the REST API.
            </p>
            <Button asChild size="sm" className="mt-2">
              <Link href="/app/settings/billing">Upgrade</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
