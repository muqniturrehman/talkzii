import type { Metadata } from 'next';
import { BroadcastWizard } from '@/components/app/broadcasts/broadcast-wizard';
import { requireRole } from '@/lib/auth/session';
import { loadWizardData } from '@/lib/broadcasts/wizard-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'New broadcast' };

export default async function NewBroadcastPage() {
  await requireRole('admin', '/app/broadcasts/new');
  const { phones, templates } = await loadWizardData(await createSupabaseServerClient());
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <BroadcastWizard phones={phones} templates={templates} />
    </div>
  );
}
