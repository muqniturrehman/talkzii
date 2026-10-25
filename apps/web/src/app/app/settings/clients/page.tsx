import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { planHasFeature } from '@talkzi/shared';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { ClientWorkspaces } from '@/components/app/settings/client-workspaces';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Client workspaces' };

export default async function ClientWorkspacesPage() {
  const session = await requireRole('admin', '/app/settings/clients');
  const ws = session.workspace;
  if (!planHasFeature(ws.plan, 'sub_accounts') || ws.parent_workspace_id) redirect('/app/settings/branding');

  return (
    <Card>
      <CardHeader>
        <CardTitle>Client workspaces</CardTitle>
        <CardDescription>Run WhatsApp for every brand you manage from one agency account.</CardDescription>
      </CardHeader>
      <CardContent>
        <ClientWorkspaces />
      </CardContent>
    </Card>
  );
}
