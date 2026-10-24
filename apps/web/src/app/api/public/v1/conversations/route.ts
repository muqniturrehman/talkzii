import { publicListQuerySchema } from '@talkzi/shared';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createPublicHandler } from '@/lib/public-api/handler';
import { cursorFilter, decodeCursor, encodeCursor } from '@/lib/public-api/service';

const querySchema = publicListQuerySchema.extend({ status: z.enum(['open', 'pending', 'snoozed', 'resolved']).optional() });

/** GET /api/public/v1/conversations — newest first, cursor pagination. */
export const GET = createPublicHandler({ scope: 'conversations:read', query: querySchema }, async ({ admin, key, query }) => {
  let q = admin
    .from('conversations')
    .select('id, status, assigned_to, unread_count, last_message_at, last_message_preview, expires_at, created_at, contact:contacts(id, wa_id, name, profile_name)')
    .eq('workspace_id', key.workspace.id)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(query.limit + 1);
  if (query.status) q = q.eq('status', query.status);
  const cursor = decodeCursor(query.cursor);
  if (cursor) q = q.or(cursorFilter(cursor));
  const { data, error } = await q;
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  const rows = data ?? [];
  const page = rows.slice(0, query.limit).map((c) => ({
    ...c,
    session_open: Boolean(c.expires_at && new Date(c.expires_at) > new Date()),
  }));
  const last = page.at(-1);
  return { items: page, next_cursor: rows.length > query.limit && last ? encodeCursor(last) : null };
});
