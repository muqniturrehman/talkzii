import { updateWorkspaceSchema } from '@talkzi/shared';
import type { TablesUpdate } from '@talkzi/db';
import { audit } from '@/lib/audit';
import { createHandler, unwrap } from '@/lib/api/handler';

export const GET = createHandler({}, async ({ supabase, workspace }) => {
  return unwrap(await supabase.from('workspaces').select('*').eq('id', workspace.id).single());
});

export const PATCH = createHandler(
  { role: 'admin', body: updateWorkspaceSchema },
  async ({ body, supabase, workspace, user, req }) => {
    const patch: TablesUpdate<'workspaces'> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.timezone !== undefined) patch.timezone = body.timezone;
    if (body.defaultCountryCode !== undefined) patch.default_country_code = body.defaultCountryCode;
    if (body.logoUrl !== undefined) patch.logo_url = body.logoUrl;

    const updated = unwrap(await supabase.from('workspaces').update(patch).eq('id', workspace.id).select('*').single());
    await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.updated', metadata: { fields: Object.keys(patch) }, req });
    return updated;
  },
);
