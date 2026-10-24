import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createPublicHandler } from '@/lib/public-api/handler';

/** GET /api/public/v1/templates — templates with review status and components. */
export const GET = createPublicHandler(
  { scope: 'templates:read', query: z.object({ status: z.enum(['APPROVED', 'PENDING', 'REJECTED', 'DRAFT', 'PAUSED', 'DISABLED']).optional() }) },
  async ({ admin, key, query }) => {
    let q = admin
      .from('message_templates')
      .select('id, name, language, category, status, components, rejected_reason, quality_score, updated_at')
      .eq('workspace_id', key.workspace.id)
      .order('name');
    if (query.status) q = q.eq('status', query.status);
    const { data, error } = await q;
    if (error) throw new ApiError(500, 'INTERNAL_ERROR', error.message);
    return { items: data ?? [] };
  },
);
