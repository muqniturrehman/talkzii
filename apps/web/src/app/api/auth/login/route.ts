import { loginSchema, safeNextPath } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS, rateLimit } from '@/lib/rate-limit';

export const POST = createHandler(
  { auth: 'public', body: loginSchema, rateLimit: RATE_LIMITS.auth },
  async ({ body, supabase, log }) => {
    // Per-account limit on top of the per-IP limit (credential stuffing).
    const perEmail = await rateLimit(RATE_LIMITS.authStrict, `login:${body.email}`);
    if (!perEmail.success) throw ApiError.rateLimited(Math.ceil((perEmail.reset - Date.now()) / 1000));

    const { error } = await supabase.auth.signInWithPassword({ email: body.email, password: body.password });
    if (error) {
      log.info({ reason: error.code ?? error.message }, 'login failed');
      if (/not confirmed/i.test(error.message)) {
        throw new ApiError(401, 'UNAUTHORIZED', 'Please confirm your email address first — check your inbox.');
      }
      throw new ApiError(401, 'UNAUTHORIZED', 'Incorrect email or password.');
    }
    return { next: safeNextPath(body.next) };
  },
);
