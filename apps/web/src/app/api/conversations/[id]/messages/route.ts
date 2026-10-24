import { messagePageQuerySchema } from '@talkzi/shared';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { listMessages } from '@/lib/inbox/queries';

export const GET = createHandler({ role: 'viewer', query: messagePageQuerySchema }, async ({ supabase, params, query }) =>
  listMessages(supabase, requireUuid(params.id, 'Conversation'), query),
);
