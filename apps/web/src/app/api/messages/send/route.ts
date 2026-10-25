import { sendMessageSchema } from '@talkzi/shared';
import { createHandler } from '@/lib/api/handler';
import { sendMessage } from '@/lib/messaging/send';
import { messagingDeps } from '@/lib/messaging/supabase-store';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const maxDuration = 30;

/** Sends a message in a conversation (24h window enforced server-side). */
export const POST = createHandler(
  { role: 'agent', body: sendMessageSchema, rateLimit: RATE_LIMITS.send },
  async ({ body, workspace, user, admin }) => {
    return sendMessage(body, { workspaceId: workspace.id, senderId: user.id, senderType: 'agent', plan: workspace.plan }, messagingDeps(admin()));
  },
);
