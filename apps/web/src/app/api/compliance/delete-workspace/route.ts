import { deleteWorkspaceSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { getStripe } from '@/lib/billing/stripe';
import { deleteWorkspace } from '@/lib/compliance/deletion';
import { configured } from '@/lib/env';

export const maxDuration = 300;

/**
 * Permanently deletes the active workspace (owner only, confirmed by typing
 * its name). Returns a confirmation code for /data-deletion.
 */
export const POST = createHandler({ role: 'owner', body: deleteWorkspaceSchema, rateLimit: { prefix: 'delete-workspace', limit: 3, windowSeconds: 300 } }, async ({ admin, body, workspace, user, log }) => {
  if (body.confirmName !== workspace.name) {
    throw ApiError.validation({ fieldErrors: { confirmName: ['Type the workspace name exactly as shown'] } });
  }
  return deleteWorkspace(
    admin(),
    { workspaceId: workspace.id, requesterId: user.id, requesterEmail: user.email },
    {
      log,
      cancelSubscription: configured.stripe()
        ? async (id) => {
            await getStripe().subscriptions.cancel(id);
          }
        : undefined,
    },
  );
});
