import { newPasswordSchema } from '@talkzi/shared';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const POST = createHandler(
  { auth: 'user', body: newPasswordSchema, rateLimit: RATE_LIMITS.authStrict },
  async ({ body, supabase, user, req }) => {
    const { error } = await supabase.auth.updateUser({ password: body.password });
    if (error) throw ApiError.badRequest(error.message);
    await audit({ workspaceId: null, actorId: user.id, action: 'user.password_changed', req });
    return { ok: true };
  },
);
