import { draftToComponents, isTemplateLocked, templateDraftSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { isWhatsAppApiError } from '@talkzi/whatsapp';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getWabaContext } from '@/lib/meta/whatsapp';
import { TEMPLATE_COLUMNS } from '@/lib/templates/service';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) => {
  const id = requireUuid(params.id, 'Template');
  const { data } = await supabase.from('message_templates').select(TEMPLATE_COLUMNS).eq('id', id).maybeSingle();
  if (!data) throw ApiError.notFound('Template not found.');
  return data;
});

/** Edits a draft or rejected template. Approved and in-review templates are locked. */
export const PATCH = createHandler({ role: 'admin', body: templateDraftSchema }, async ({ supabase, params, body }) => {
  const id = requireUuid(params.id, 'Template');
  const { data: current } = await supabase.from('message_templates').select('id, status, name, language, meta_template_id').eq('id', id).maybeSingle();
  if (!current) throw ApiError.notFound('Template not found.');
  if (isTemplateLocked(current.status)) {
    throw ApiError.conflict(`${current.status.toLowerCase()} templates can't be edited. Duplicate it to make changes.`, 'TEMPLATE_LOCKED');
  }
  if (current.meta_template_id && (current.name !== body.name || current.language !== body.language)) {
    throw ApiError.conflict('The name and language of a submitted template cannot change. Duplicate it instead.', 'TEMPLATE_LOCKED');
  }

  const { data, error } = await supabase
    .from('message_templates')
    .update({ name: body.name, language: body.language, category: body.category, components: draftToComponents(body) as unknown as Json })
    .eq('id', id)
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error?.code === '23505') throw ApiError.conflict('A template with this name and language already exists.');
  if (error) throw ApiError.forbidden();
  return data;
});

/** Deletes the template locally and on Meta (all languages of that name are removed by Meta). */
export const DELETE = createHandler({ role: 'admin' }, async ({ supabase, admin, params, workspace, user, req, log }) => {
  const id = requireUuid(params.id, 'Template');
  const { data: row } = await supabase.from('message_templates').select('id, name, meta_template_id, waba_account_id').eq('id', id).maybeSingle();
  if (!row) throw ApiError.notFound('Template not found.');

  if (row.meta_template_id && row.waba_account_id) {
    try {
      const ctx = await getWabaContext(admin(), workspace.id, row.waba_account_id);
      await ctx.client.deleteTemplate(ctx.waba.waba_id, { name: row.name, hsmId: row.meta_template_id });
    } catch (error) {
      if (!(isWhatsAppApiError(error) && error.status === 404)) {
        log.warn({ err: error }, 'Meta template delete failed');
        throw new ApiError(502, 'WHATSAPP_ERROR', isWhatsAppApiError(error) ? error.friendlyMessage : 'Could not delete the template on WhatsApp.');
      }
    }
  }
  const { error } = await supabase.from('message_templates').delete().eq('id', id);
  if (error) throw ApiError.forbidden();
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'template.deleted', targetType: 'message_template', targetId: id, metadata: { name: row.name }, req });
  return { id };
});
