import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { TEMPLATE_COLUMNS } from '@/lib/templates/service';

/** Copies a template into a new draft ("name_v2", "name_v3", …) so locked templates can evolve. */
export const POST = createHandler({ role: 'admin' }, async ({ supabase, params, workspace, user }) => {
  const id = requireUuid(params.id, 'Template');
  const { data: source } = await supabase.from('message_templates').select('name, language, category, components').eq('id', id).maybeSingle();
  if (!source) throw ApiError.notFound('Template not found.');

  const base = source.name.replace(/_v\d+$/, '');
  const { data: siblings } = await supabase.from('message_templates').select('name').like('name', `${base}%`).eq('language', source.language);
  const taken = new Set((siblings ?? []).map((s) => s.name));
  let n = 2;
  while (taken.has(`${base}_v${n}`)) n++;

  const { data, error } = await supabase
    .from('message_templates')
    .insert({
      workspace_id: workspace.id,
      name: `${base}_v${n}`.slice(0, 512),
      language: source.language,
      category: source.category,
      components: source.components,
      status: 'DRAFT',
      created_by: user.id,
    })
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) throw ApiError.forbidden();
  return data;
});
