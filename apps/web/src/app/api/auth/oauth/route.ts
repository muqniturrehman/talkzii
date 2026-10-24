import { oauthSchema, safeNextPath } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { getOrigin } from '@/lib/request';

/** Starts Google OAuth (PKCE). The verifier cookie is set on this response. */
export const POST = createHandler(
  { auth: 'public', body: oauthSchema, rateLimit: RATE_LIMITS.auth },
  async ({ body, supabase, req }) => {
    const next = safeNextPath(body.next);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: body.provider,
      options: {
        redirectTo: `${getOrigin(req)}/auth/callback?next=${encodeURIComponent(next)}`,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' },
      },
    });
    if (error || !data.url) throw ApiError.badRequest(error?.message ?? 'Could not start Google sign-in.');
    return { url: data.url };
  },
);
