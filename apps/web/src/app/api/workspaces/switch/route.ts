import { switchWorkspaceSchema } from '@talkzi/shared';
import { createHandler, unwrap } from '@/lib/api/handler';

/** Switches the active workspace and re-issues the JWT with the new claim. */
export const POST = createHandler(
  { auth: 'user', body: switchWorkspaceSchema },
  async ({ body, supabase }) => {
    unwrap(await supabase.rpc('switch_workspace', { p_workspace_id: body.workspaceId }));
    await supabase.auth.refreshSession();
    return { workspaceId: body.workspaceId };
  },
);
