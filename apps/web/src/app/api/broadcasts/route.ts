import { saveBroadcastSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { BROADCAST_LIST_COLUMNS } from '@/lib/broadcasts/columns';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase }) =>
  unwrap(await supabase.from('broadcasts').select(BROADCAST_LIST_COLUMNS).order('created_at', { ascending: false }).limit(200)),
);

/** Creates a draft broadcast (admin). Launching is a separate step. */
export const POST = createHandler({ role: 'admin', feature: 'broadcasts', body: saveBroadcastSchema }, async ({ supabase, body, workspace, user }) => {
  const { data: template } = await supabase.from('message_templates').select('id, name, language').eq('id', body.templateId).maybeSingle();
  if (!template) throw ApiError.validation({ fieldErrors: { templateId: ['Template not found'] } });
  const { data, error } = await supabase
    .from('broadcasts')
    .insert({
      workspace_id: workspace.id,
      name: body.name,
      template_id: template.id,
      template_name: template.name,
      template_language: template.language,
      phone_number_id: body.phoneNumberId ?? null,
      audience: body.audience as unknown as Json,
      variable_mapping: body.variables as unknown as Json,
      status: 'draft',
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error || !data) throw ApiError.forbidden();
  return data;
});
