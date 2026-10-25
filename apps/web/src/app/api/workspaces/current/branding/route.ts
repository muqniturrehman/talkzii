import { brandingSchema, parseBranding } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { audit } from '@/lib/audit';
import { createHandler, unwrap } from '@/lib/api/handler';

/** Replaces the workspace's white-label branding (Agency plans; clients inherit it). */
export const PATCH = createHandler({ role: 'admin', feature: 'white_label', body: brandingSchema }, async ({ supabase, body, workspace, user, req }) => {
  const row = unwrap(await supabase.from('workspaces').update({ branding: body as Json }).eq('id', workspace.id).select('branding').single());
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.branding_updated', metadata: { fields: Object.keys(body) }, req });
  return parseBranding(row.branding);
});
