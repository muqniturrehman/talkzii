import { z } from 'zod';
import { draftToComponents, saveTemplateSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { resolveWabaId, submitTemplate, TEMPLATE_COLUMNS } from '@/lib/templates/service';

const TEMPLATE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'] as const;

export const GET = createHandler(
  { role: 'viewer', query: z.object({ status: z.enum(TEMPLATE_STATUSES).optional() }) },
  async ({ supabase, query }) => {
    let q = supabase.from('message_templates').select('id, name, language, category, status, components, rejected_reason, quality_score, updated_at').order('name');
    if (query.status) q = q.eq('status', query.status);
    return unwrap(await q);
  },
);

/** Saves a template draft and optionally submits it to Meta for review (admin). */
export const POST = createHandler(
  { role: 'admin', body: saveTemplateSchema },
  async ({ supabase, admin, body, workspace, user, req }) => {
    const db = admin();
    const wabaAccountId = body.submit ? await resolveWabaId(db, workspace.id, body.wabaAccountId) : (body.wabaAccountId ?? null);
    const { data: row, error } = await supabase
      .from('message_templates')
      .insert({
        workspace_id: workspace.id,
        waba_account_id: wabaAccountId,
        name: body.draft.name,
        language: body.draft.language,
        category: body.draft.category,
        components: draftToComponents(body.draft) as unknown as Json,
        status: 'DRAFT',
        created_by: user.id,
      })
      .select(TEMPLATE_COLUMNS)
      .single();
    if (error?.code === '23505') throw ApiError.conflict('A template with this name and language already exists.');
    if (error || !row) throw ApiError.forbidden();

    const saved = body.submit ? await submitTemplate(db, row) : row;
    await audit({
      workspaceId: workspace.id,
      actorId: user.id,
      action: body.submit ? 'template.submitted' : 'template.created',
      targetType: 'message_template',
      targetId: row.id,
      metadata: { name: row.name, language: row.language },
      req,
    });
    return saved;
  },
);
