import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { componentsToDraft, hasMinRole, isTemplateLocked } from '@talkzi/shared';
import { TemplateEditor } from '@/components/app/templates/template-editor';
import { TemplateViewer } from '@/components/app/templates/template-viewer';
import { requireWorkspace } from '@/lib/auth/session';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Template' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireWorkspace(`/app/templates/${id}`);
  if (!UUID_RE.test(id)) notFound();
  const supabase = await createSupabaseServerClient();
  const { data: template } = await supabase
    .from('message_templates')
    .select('id, name, language, category, status, components, rejected_reason, quality_score, submitted_at, approved_at, meta_template_id')
    .eq('id', id)
    .maybeSingle();
  if (!template) notFound();

  const editable = hasMinRole(session.workspace.role, 'admin') && !isTemplateLocked(template.status);
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      {editable ? (
        <TemplateEditor
          mode="edit"
          templateId={template.id}
          initial={componentsToDraft(template, template.components)}
          status={template.status}
          rejectedReason={template.rejected_reason}
        />
      ) : (
        <TemplateViewer template={template} />
      )}
    </div>
  );
}
