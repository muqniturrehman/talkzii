import { safeNextPath, signupSchema } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { getOrigin } from '@/lib/request';

export const POST = createHandler(
  { auth: 'public', body: signupSchema, rateLimit: RATE_LIMITS.authStrict },
  async ({ body, supabase, req }) => {
    const next = safeNextPath(body.next, '/onboarding');
    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { full_name: body.fullName },
        emailRedirectTo: `${getOrigin(req)}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) {
        throw ApiError.conflict('An account with this email already exists. Try signing in.');
      }
      if (/password/i.test(error.message)) throw ApiError.validation({ fieldErrors: { password: [error.message] } }, error.message);
      throw ApiError.badRequest(error.message);
    }
    // No session → email confirmation is enabled on the Supabase project.
    return { needsConfirmation: !data.session, next };
  },
);
