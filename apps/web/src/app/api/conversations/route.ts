import { conversationListQuerySchema } from '@talkzi/shared';
import { createHandler } from '@/lib/api/handler';
import { listConversations } from '@/lib/inbox/queries';

export const GET = createHandler({ role: 'viewer', query: conversationListQuerySchema }, async ({ supabase, user, query }) =>
  listConversations(supabase, user.id, query),
);
