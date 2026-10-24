import type { NextRequest } from 'next/server';
import { hasMinRole, isWorkspaceRole, requiredRoleForPath } from '@talkzi/shared';
import { redirectPreservingCookies, updateSession } from '@/lib/supabase/proxy';

const AUTH_PAGES = new Set(['/login', '/signup', '/forgot-password']);

/**
 * Next.js 16 proxy (formerly middleware):
 *  - refreshes the Supabase session cookie
 *  - requires a session for /app and /onboarding
 *  - bounces signed-in users away from auth pages
 *  - fast-path role gating from the JWT `workspace_role` claim
 *    (pages, APIs and RLS re-check with live membership)
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const { response, claims } = await updateSession(request);

  const isApp = pathname === '/app' || pathname.startsWith('/app/');
  const needsSession = isApp || pathname === '/onboarding' || pathname.startsWith('/onboarding/');

  if (needsSession && !claims) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectPreservingCookies(url, response);
  }

  if (AUTH_PAGES.has(pathname) && claims) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next');
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
    url.search = '';
    return redirectPreservingCookies(url, response);
  }

  if (isApp && claims) {
    const required = requiredRoleForPath(pathname);
    const role = claims.workspace_role;
    if (required && isWorkspaceRole(role) && !hasMinRole(role, required)) {
      const url = request.nextUrl.clone();
      url.pathname = '/app';
      url.search = '?denied=1';
      return redirectPreservingCookies(url, response);
    }
  }

  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export const config = {
  matcher: [
    '/app/:path*',
    '/onboarding/:path*',
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/invite/:path*',
  ],
};

