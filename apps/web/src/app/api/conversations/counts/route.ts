import { createHandler } from '@/lib/api/handler';
import { inboxCounts } from '@/lib/inbox/queries';

export const GET = createHandler({ role: 'viewer' }, async ({ supabase, user }) => inboxCounts(supabase, user.id));
