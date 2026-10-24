import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@talkzi/shared';
import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/public-env';
import { getOrigin } from '@/lib/request';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * PKCE callback for OAuth, magic links, signup confirmation and password
 * recovery: exchanges ?code= for a session cookie, then redirects to ?next=.
 */
export async function GET(request: NextRequest) {
  const origin = getOrigin(request);
  const { searchParams } = request.nextUrl;
  const next = safeNextPath(searchParams.get('next'));
  const providerError = searchParams.get('error_description') ?? searchParams.get('error');

  if (providerError) {
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(providerError)}`);
  }

  const code = searchParams.get('code');
  if (code && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    logger.warn({ err: error.message }, 'auth callback exchange failed');
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('That sign-in link is invalid or has expired. Please try again.')}`,
  );
}
