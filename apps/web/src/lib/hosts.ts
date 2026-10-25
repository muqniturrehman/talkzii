/**
 * Host helpers shared by the proxy and server components (no Node-only or
 * server-only imports).
 */

export function normalizeHost(host: string | null | undefined): string | null {
  const h = host?.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  return h || null;
}

export function appHostname(): string | null {
  try {
    return process.env.NEXT_PUBLIC_APP_URL ? new URL(process.env.NEXT_PUBLIC_APP_URL).hostname.toLowerCase() : null;
  } catch {
    return null;
  }
}

/** Talkzi's own domain (and its subdomains), localhost and Vercel preview hosts. */
export function isPlatformHost(host: string, app = appHostname()): boolean {
  if (app && (host === app || host.endsWith(`.${app}`))) return true;
  if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost')) return true;
  return host.endsWith('.vercel.app');
}

/** True for a host that isn't a platform host — i.e. an agency's custom domain pointed here. */
export function isCustomDomainHost(host: string | null | undefined, app = appHostname()): boolean {
  const h = normalizeHost(host);
  return Boolean(h && app && !isPlatformHost(h, app));
}
