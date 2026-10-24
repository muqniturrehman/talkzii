import { resolveAiSettings, resolveCompliance, updateWorkspaceSettingsSchema, type WorkspaceSettings } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';
import { audit } from '@/lib/audit';

/** Merges AI / compliance settings into workspaces.settings (admin). */
export const PATCH = createHandler(
  { role: 'admin', body: updateWorkspaceSettingsSchema },
  async ({ body, supabase, workspace, user, req }) => {
    const { data: current } = await supabase.from('workspaces').select('settings').eq('id', workspace.id).maybeSingle();
    if (!current) throw ApiError.notFound('Workspace not found.');
    const settings = (current.settings && typeof current.settings === 'object' ? current.settings : {}) as WorkspaceSettings &
      Record<string, unknown>;

    const next: WorkspaceSettings & Record<string, unknown> = { ...settings };
    if (body.ai) next.ai = { ...resolveAiSettings(settings), ...body.ai };
    if (body.compliance) next.compliance = { ...resolveCompliance(settings), ...body.compliance };

    const updated = unwrap(
      await supabase.from('workspaces').update({ settings: next as Json }).eq('id', workspace.id).select('settings').single(),
    );
    await audit({
      workspaceId: workspace.id,
      actorId: user.id,
      action: 'workspace.settings_updated',
      metadata: { sections: Object.keys(body) },
      req,
    });
    return { ai: resolveAiSettings(updated.settings), compliance: resolveCompliance(updated.settings) };
  },
);
