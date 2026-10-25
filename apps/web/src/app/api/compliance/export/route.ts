import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { workspaceExportStream } from '@/lib/compliance/export';

export const maxDuration = 300;

/** Streams the entire workspace as JSON (admin). Secrets are never included. */
export const GET = createHandler({ role: 'admin', rateLimit: { prefix: 'export', limit: 3, windowSeconds: 300 } }, async ({ admin, workspace, user, req }) => {
  const db = admin();
  const { data: row } = await db
    .from('workspaces')
    .select('id, name, slug, plan, timezone, default_country_code, branding, settings, custom_domain, parent_workspace_id, created_at')
    .eq('id', workspace.id)
    .single();
  await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.exported', req });
  const date = new Date().toISOString().slice(0, 10);
  return new Response(workspaceExportStream(db, row ?? { id: workspace.id }), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="talkzi-${workspace.slug}-${date}.json"`,
      'cache-control': 'no-store',
    },
  });
});
