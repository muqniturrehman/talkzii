import type { Metadata } from 'next';
import { TemplateEditor } from '@/components/app/templates/template-editor';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'New template' };

export default async function NewTemplatePage() {
  await requireRole('admin', '/app/templates/new');
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <TemplateEditor mode="create" />
    </div>
  );
}
