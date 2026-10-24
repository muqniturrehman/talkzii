import type { NextRequest } from 'next/server';

/** Best-effort client IP (Vercel sets x-forwarded-for / x-real-ip). */
export function getClientIp(req: Request | NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() || 'unknown';
  return req.headers.get('x-real-ip') ?? 'unknown';
}

/** Public origin of the current request (respects proxies on Vercel). */
export function getOrigin(req: Request | NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  if (host) {
    const proto = req.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
    return `${proto}://${host}`;
  }
  return (configured ?? 'http://localhost:3000').replace(/\/$/, '');
}
