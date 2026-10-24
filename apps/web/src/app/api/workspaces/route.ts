import { createWorkspaceSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, unwrap } from '@/lib/api/handler';

/** Creates a workspace (caller becomes owner) and refreshes the JWT claims. */
export const POST = createHandler(
  { auth: 'user', body: createWorkspaceSchema },
  async ({ body, supabase, user, req }) => {
    const workspace = unwrap(
      await supabase
        .rpc('create_workspace', {
          p_name: body.name,
          p_timezone: body.timezone,
          p_default_country_code: body.defaultCountryCode,
        }),
    );
    if (!workspace) throw new ApiError(500, 'INTERNAL_ERROR', 'Workspace could not be created.');
    await supabase.auth.refreshSession();
    await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.created', targetType: 'workspace', targetId: workspace.id, req });
    return { workspace };
  },
);
