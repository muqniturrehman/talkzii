import { broadcastActionSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { getBroadcastQueue } from '@/lib/broadcasts/queue';

const AUDIT_ACTION = { pause: 'broadcast.paused', resume: 'broadcast.resumed', cancel: 'broadcast.cancelled' } as const;

/** Pause, resume or cancel a broadcast (admin). */
export const POST = createHandler({ role: 'admin', body: broadcastActionSchema }, async ({ admin, params, body, workspace, user, req, log }) => {
  const id = requireUuid(params.id, 'Broadcast');
  const db = admin();
  const { data: b } = await db
    .from('broadcasts')
    .select('id, status, started_at, phone:phone_numbers(quality_rating), template:message_templates(status)')
    .eq('id', id)
    .eq('workspace_id', workspace.id)
    .maybeSingle();
  if (!b) throw ApiError.notFound('Broadcast not found.');

  const queue = await getBroadcastQueue(db, log);
  try {
    switch (body.action) {
      case 'pause': {
        if (!['scheduled', 'sending'].includes(b.status)) throw ApiError.conflict(`A ${b.status} broadcast can't be paused.`);
        await db.from('broadcasts').update({ status: 'paused', paused_reason: 'Paused by a teammate', locked_until: null }).eq('id', id);
        await queue.remove(id);
        break;
      }
      case 'resume': {
        if (b.status !== 'paused') throw ApiError.conflict('Only paused broadcasts can be resumed.');
        if (b.template?.status !== 'APPROVED') throw ApiError.conflict('The template is no longer approved.', 'TEMPLATE_NOT_APPROVED');
        if (b.phone?.quality_rating === 'RED') throw ApiError.conflict('The number’s quality is still RED. Try again once it recovers.', 'WHATSAPP_ERROR');
        const now = new Date();
        await db
          .from('broadcasts')
          .update({ status: b.started_at ? 'sending' : 'scheduled', scheduled_at: now.toISOString(), paused_reason: null, locked_until: null })
          .eq('id', id);
        await queue.enqueue(id, now);
        break;
      }
      case 'cancel': {
        if (!['scheduled', 'sending', 'paused'].includes(b.status)) throw ApiError.conflict(`A ${b.status} broadcast can't be cancelled.`);
        await db.from('broadcasts').update({ status: 'cancelled', completed_at: new Date().toISOString(), locked_until: null }).eq('id', id);
        await db
          .from('broadcast_recipients')
          .update({ status: 'skipped', error_message: 'Broadcast cancelled' })
          .eq('broadcast_id', id)
          .in('status', ['pending', 'sending']);
        await queue.remove(id);
        break;
      }
    }
  } finally {
    await queue.close();
  }

  await audit({ workspaceId: workspace.id, actorId: user.id, action: AUDIT_ACTION[body.action], targetType: 'broadcast', targetId: id, req });
  return { id, action: body.action };
});
