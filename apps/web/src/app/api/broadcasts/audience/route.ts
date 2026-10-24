import { z } from 'zod';
import { audienceSchema } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { createHandler } from '@/lib/api/handler';

/** Live audience size for the broadcast wizard. */
export const POST = createHandler({ role: 'viewer', body: z.object({ audience: audienceSchema }) }, async ({ admin, body, workspace }) => {
  const db = admin();
  const count = async (optedOut: boolean) => {
    const { count: n } = await db
      .rpc('broadcast_audience', { p_workspace_id: workspace.id, p_audience: body.audience as unknown as Json }, { count: 'exact', head: true })
      .eq('opted_out', optedOut);
    return n ?? 0;
  };
  const [sendable, optedOut] = await Promise.all([count(false), count(true)]);
  return { sendable, optedOut, total: sendable + optedOut };
});
