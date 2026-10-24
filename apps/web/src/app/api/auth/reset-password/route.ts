import { newPasswordSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';

/** Sets a new password for the signed-in (or recovery-session) user. */
export const POST = createHandler(
  { auth: 'user', body: newPasswordSchema, rateLimit: RATE_LIMITS.auth },
  async ({ body, supabase }) => {
    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) throw ApiError.badRequest(error.message);
    return { ok: true };
  },
);
