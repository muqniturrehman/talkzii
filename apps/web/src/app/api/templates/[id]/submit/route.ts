import { isTemplateLocked } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { submitTemplate, TEMPLATE_COLUMNS } from '@/lib/templates/service';

export const maxDuration = 30;

export const POST = createHandler({ role: 'admin' }, async ({ admin, params, workspace, user, req }) => {
  const id = requireUuid(params.id, 'Template');
  const db = admin();
  const { data: row } = await db.from('message_templates').select(TEMPLATE_COLUMNS).eq('id', id).eq('workspace_id', workspace.id).maybeSingle();
  if (!row) throw ApiError.notFound('Template not found.');
  if (isTemplateLocked(row.status)) throw ApiError.conflict(`This template is ${row.status.toLowerCase()} and can't be resubmitted.`, 'TEMPLATE_LOCKED');

  const saved = await submitTemplate(db, row);
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'template.submitted', targetType: 'message_template', targetId: id, req });
  return saved;
});
