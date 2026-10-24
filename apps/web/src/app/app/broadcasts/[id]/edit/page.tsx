import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { audienceSchema, variableMappingSchema } from '@talkzi/shared';
import { BroadcastWizard } from '@/components/app/broadcasts/broadcast-wizard';
import { requireRole } from '@/lib/auth/session';
import { loadWizardData } from '@/lib/broadcasts/wizard-data';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Edit broadcast' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function EditBroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireRole('admin', `/app/broadcasts/${id}/edit`);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: b } = await supabase
    .from('broadcasts')
    .select('id, name, status, template_id, phone_number_id, audience, variable_mapping')
    .eq('id', id)
    .maybeSingle();
  if (!b) notFound();
  if (!['draft', 'scheduled'].includes(b.status)) redirect(`/app/broadcasts/${id}`);
  const { phones, templates } = await loadWizardData(supabase);
  const audience = audienceSchema.safeParse(b.audience);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <BroadcastWizard
        phones={phones}
        templates={templates}
        initial={{
          id: b.id,
          name: b.name,
          templateId: b.template_id,
          phoneNumberId: b.phone_number_id,
          audience: audience.success ? audience.data : { type: 'all', excludeLabelIds: [] },
          variables: variableMappingSchema.parse(b.variable_mapping ?? {}),
        }}
      />
    </div>
  );
}
