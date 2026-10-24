import { z } from 'zod';
import { createHandler, unwrap } from '@/lib/api/handler';

const TEMPLATE_STATUSES = ['DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED', 'IN_APPEAL'] as const;

export const GET = createHandler(
  { role: 'viewer', query: z.object({ status: z.enum(TEMPLATE_STATUSES).optional() }) },
  async ({ supabase, query }) => {
    let q = supabase.from('message_templates').select('id, name, language, category, status, components').order('name');
    if (query.status) q = q.eq('status', query.status);
    return unwrap(await q);
  },
);
