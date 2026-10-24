import { forgotPasswordSchema } from '@talkzi/shared';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { getOrigin } from '@/lib/request';

export const POST = createHandler(
  { auth: 'public', body: forgotPasswordSchema, rateLimit: RATE_LIMITS.authStrict },
  async ({ body, supabase, req, log }) => {
    const { error } = await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo: `${getOrigin(req)}/auth/callback?next=${encodeURIComponent('/reset-password')}`,
    });
    if (error) log.warn({ err: error.message }, 'password reset request failed');
    // Always succeed to avoid account enumeration.
    return { sent: true };
  },
);
