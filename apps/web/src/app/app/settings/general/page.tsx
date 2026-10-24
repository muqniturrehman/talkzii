import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { GeneralSettingsForm } from '@/components/app/settings/general-form';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'General settings' };

export default async function GeneralSettingsPage() {
  const session = await requireRole('admin', '/app/settings/general');
  const ws = session.workspace;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Workspace</CardTitle>
        <CardDescription>Name, logo, timezone and phone number defaults.</CardDescription>
      </CardHeader>
      <CardContent>
        <GeneralSettingsForm
          workspaceId={ws.id}
          name={ws.name}
          logoUrl={ws.logo_url}
          timezone={ws.timezone}
          defaultCountryCode={ws.default_country_code}
        />
      </CardContent>
    </Card>
  );
}
