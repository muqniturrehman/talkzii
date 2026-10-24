import type { EmailOtpType } from '@supabase/supabase-js';
import { NextResponse, type NextRequest } from 'next/server';
import { safeNextPath } from '@talkzi/shared';
import { logger } from '@/lib/logger';
import { isSupabaseConfigured } from '@/lib/public-env';
import { getOrigin } from '@/lib/request';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const OTP_TYPES: EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email'];

/**
 * token_hash flow (works across devices). Point the Supabase email templates
 * at: {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/app
 */
export async function GET(request: NextRequest) {
  const origin = getOrigin(request);
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next = safeNextPath(searchParams.get('next'), type === 'recovery' ? '/reset-password' : '/app');

  if (tokenHash && type && OTP_TYPES.includes(type) && isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return NextResponse.redirect(`${origin}${next}`);
    logger.warn({ err: error.message, type }, 'email OTP verification failed');
  }

  return NextResponse.redirect(
    `${origin}/login?error=${encodeURIComponent('That link is invalid or has expired. Please request a new one.')}`,
  );
}
