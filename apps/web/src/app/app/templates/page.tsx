import type { Metadata } from 'next';
import { PageHeader } from '@talkzi/ui/page-header';
import { TemplatesList } from '@/components/app/templates/templates-list';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Templates' };

export default async function TemplatesPage() {
  await requireWorkspace('/app/templates');
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Message templates"
        description="Meta-approved messages for starting conversations, broadcasts and replies after the 24-hour window. Status updates arrive automatically."
      />
      <TemplatesList />
    </div>
  );
}
