import { createHandler } from '@/lib/api/handler';
import { syncWorkspaceTemplates } from '@/lib/templates/service';

export const maxDuration = 60;

/** Pulls templates (and their review status) from Meta into Talkzi. */
export const POST = createHandler({ role: 'admin' }, async ({ admin, workspace, log }) => syncWorkspaceTemplates(admin(), workspace.id, log));
