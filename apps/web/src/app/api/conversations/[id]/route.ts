import { after } from 'next/server';
import { updateConversationSchema } from '@talkzi/shared';
import type { TablesUpdate } from '@talkzi/db';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid, unwrap } from '@/lib/api/handler';
import { getConversationDetail } from '@/lib/inbox/queries';
import { emitEvent } from '@/lib/outbound/emit';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, params }) =>
  getConversationDetail(supabase, requireUuid(params.id, 'Conversation')),
);

/** Status, assignment, snooze, bot pause and CSAT. RLS: agent+. */
export const PATCH = createHandler({ role: 'agent', body: updateConversationSchema }, async ({ supabase, admin, params, body, workspace, user, log }) => {
  const id = requireUuid(params.id, 'Conversation');
  const now = new Date();
  const update: TablesUpdate<'conversations'> = {};

  if (body.status) {
    update.status = body.status;
    update.resolved_at = body.status === 'resolved' ? now.toISOString() : null;
    if (body.status !== 'snoozed') update.snoozed_until = null;
  }

  if (body.snoozedUntil !== undefined && body.snoozedUntil !== null) {
    if (new Date(body.snoozedUntil).getTime() <= now.getTime()) {
      throw ApiError.validation({ fieldErrors: { snoozedUntil: ['Pick a time in the future'] } });
    }
    update.status = 'snoozed';
    update.snoozed_until = body.snoozedUntil;
    update.resolved_at = null;
  } else if (body.status === 'snoozed') {
    throw ApiError.validation({ fieldErrors: { snoozedUntil: ['Choose when the conversation should wake up'] } });
  }

  if (body.assignedTo !== undefined) {
    if (body.assignedTo) {
      const { data: member } = await supabase
        .from('workspace_members')
        .select('user_id')
        .eq('workspace_id', workspace.id)
        .eq('user_id', body.assignedTo)
        .maybeSingle();
      if (!member) throw ApiError.validation({ fieldErrors: { assignedTo: ['Not a member of this workspace'] } });
    }
    update.assigned_to = body.assignedTo;
  }
  if (body.botPaused !== undefined) update.bot_paused = body.botPaused;
  if (body.csatScore !== undefined) update.csat_score = body.csatScore;

  const row = unwrap(
    await supabase
      .from('conversations')
      .update(update)
      .eq('id', id)
      .select('id, status, assigned_to, snoozed_until, resolved_at, bot_paused, csat_score')
      .maybeSingle(),
  );
  if (!row) throw ApiError.notFound('Conversation not found.');
  if (body.status === 'resolved') {
    after(() => emitEvent(admin(), workspace.id, 'conversation.resolved', { conversation_id: id, resolved_by: user.id, csat_score: row.csat_score }, log));
  }
  return row;
});
