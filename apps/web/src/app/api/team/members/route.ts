import { createHandler } from '@/lib/api/handler';
import { listMembers } from '@/lib/inbox/queries';

/** Members of the active workspace (assignment pickers, @mentions). */
export const GET = createHandler({ role: 'viewer' }, async ({ supabase, workspace }) => listMembers(supabase, workspace.id));
