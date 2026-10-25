import type { Metadata } from 'next';
import { resolveCompliance } from '@talkzi/shared';
import { ComplianceSettingsForm } from '@/components/app/settings/compliance-settings';
import { requireRole } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Compliance' };

export default async function ComplianceSettingsPage() {
  const session = await requireRole('admin', '/app/settings/compliance');
  const supabase = await createSupabaseServerClient();
  const [{ data: ws }, { count }] = await Promise.all([
    supabase.from('workspaces').select('settings').eq('id', session.workspace.id).maybeSingle(),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('opted_out', true),
  ]);
  return (
    <ComplianceSettingsForm
      initial={resolveCompliance(ws?.settings)}
      optedOutCount={count ?? 0}
      workspaceName={session.workspace.name}
      isOwner={session.workspace.role === 'owner'}
    />
  );
}
