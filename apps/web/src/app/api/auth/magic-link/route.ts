import { magicLinkSchema, safeNextPath } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS, rateLimit } from '@/lib/rate-limit';
import { getOrigin } from '@/lib/request';

export const POST = createHandler(
  { auth: 'public', body: magicLinkSchema, rateLimit: RATE_LIMITS.auth },
  async ({ body, supabase, req, log }) => {
    const perEmail = await rateLimit(RATE_LIMITS.authStrict, `magic:${body.email}`);
    if (!perEmail.success) throw ApiError.rateLimited(Math.ceil((perEmail.reset - Date.now()) / 1000));

    const next = safeNextPath(body.next);
    const { error } = await supabase.auth.signInWithOtp({
      email: body.email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${getOrigin(req)}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    // Don't reveal whether the account exists; just log failures.
    if (error) log.warn({ err: error.message }, 'magic link request failed');
    return { sent: true };
  },
);
