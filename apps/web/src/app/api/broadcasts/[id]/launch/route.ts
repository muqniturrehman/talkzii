import { launchBroadcastSchema } from '@talkzi/shared';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { launchBroadcast } from '@/lib/broadcasts/launch';
import { getBroadcastQueue } from '@/lib/broadcasts/queue';
import { createLaunchStore } from '@/lib/broadcasts/supabase-store';

export const maxDuration = 60;

/** Snapshots the audience and enqueues the broadcast (now or at scheduledAt). */
export const POST = createHandler(
  { role: 'admin', feature: 'broadcasts', body: launchBroadcastSchema },
  async ({ admin, params, body, workspace, user, req, log }) => {
    const broadcastId = requireUuid(params.id, 'Broadcast');
    const db = admin();
    const queue = await getBroadcastQueue(db, log);
    try {
      const result = await launchBroadcast({ store: createLaunchStore(db), queue }, { workspace, broadcastId, scheduledAt: body.scheduledAt });
      await audit({
        workspaceId: workspace.id,
        actorId: user.id,
        action: 'broadcast.launched',
        targetType: 'broadcast',
        targetId: broadcastId,
        metadata: { recipients: result.recipients.sendable, scheduledAt: result.scheduledAt, queue: queue.kind },
        req,
      });
      return result;
    } finally {
      await queue.close();
    }
  },
);
