import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';

const querySchema = z.object({
  status: z.enum(['pending', 'sending', 'sent', 'delivered', 'read', 'failed', 'skipped']).optional(),
  offset: z.coerce.number().int().min(0).default(0),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const GET = createHandler({ role: 'viewer', query: querySchema }, async ({ supabase, params, query }) => {
  const id = requireUuid(params.id, 'Broadcast');
  let q = supabase
    .from('broadcast_recipients')
    .select('id, wa_id, status, error_code, error_message, sent_at, delivered_at, read_at, replied_at, failed_at, contact:contacts(id, name, profile_name)', {
      count: 'exact',
    })
    .eq('broadcast_id', id)
    .order('updated_at', { ascending: false })
    .range(query.offset, query.offset + query.limit - 1);
  if (query.status) q = q.eq('status', query.status);
  const { data, error, count } = await q;
  if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
  return { items: data ?? [], total: count ?? 0 };
});
