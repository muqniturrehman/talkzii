import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { parseBranding, planHasFeature } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { BrandingForm } from '@/components/app/settings/branding-form';
import { DomainSettings } from '@/components/app/settings/domain-settings';
import { requireRole } from '@/lib/auth/session';
import { domainStatus } from '@/lib/custom-domain';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const metadata: Metadata = { title: 'Branding' };

export default async function BrandingSettingsPage() {
  const session = await requireRole('admin', '/app/settings/branding');
  const ws = session.workspace;

  if (!planHasFeature(ws.plan, 'white_label')) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <Lock className="size-6 text-primary" aria-hidden />
          <p className="font-medium">White-label branding is part of the Agency plan</p>
          <p className="max-w-md text-sm text-muted-foreground">
            Put your own name, logo and colours on Talkzi, run client workspaces under your brand and sign clients in on your own domain.
          </p>
          <Button asChild size="sm" className="mt-2">
            <Link href="/app/settings/billing">See plans</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const { data: domain } = await createSupabaseAdminClient()
    .from('workspaces')
    .select('custom_domain, custom_domain_verified_at')
    .eq('id', ws.id)
    .single();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Brand</CardTitle>
          <CardDescription>
            {ws.parent_workspace_id
              ? 'This client workspace uses the agency’s branding. Anything you set here overrides it for this client only.'
              : 'Your name, logo and colours across the dashboard. Client workspaces inherit them.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BrandingForm workspaceId={ws.id} initial={parseBranding(ws.branding)} />
        </CardContent>
      </Card>

      {planHasFeature(ws.plan, 'custom_domain') && !ws.parent_workspace_id ? (
        <Card>
          <CardHeader>
            <CardTitle>Custom domain</CardTitle>
            <CardDescription>Let clients sign in on your own domain, e.g. app.youragency.com.</CardDescription>
          </CardHeader>
          <CardContent>
            <DomainSettings initial={domainStatus(ws.id, domain?.custom_domain ?? null, domain?.custom_domain_verified_at ?? null)} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
