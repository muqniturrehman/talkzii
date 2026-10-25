import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';

/** Public status lookup for a deletion confirmation code (shown on /data-deletion). */
export const GET = createHandler(
  { auth: 'public', rateLimit: RATE_LIMITS.auth, query: z.object({ code: z.string().trim().toUpperCase().regex(/^DEL-[A-Z0-9]{6,16}$/, 'Enter a code like DEL-7K2M9QX4PB') }) },
  async ({ admin, query }) => {
    const { data } = await admin().from('data_deletion_requests').select('status, requested_at, completed_at').eq('confirmation_code', query.code).maybeSingle();
    if (!data) throw ApiError.notFound('No deletion request matches that code.');
    return { status: data.status, requestedAt: data.requested_at, completedAt: data.completed_at };
  },
);
