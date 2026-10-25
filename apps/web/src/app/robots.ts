import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';

/** Marketing pages are public; the dashboard, APIs and auth flows are not for crawlers. */
export default function robots(): MetadataRoute.Robots {
  const base = siteConfig.url.replace(/\/$/, '');
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/api', '/onboarding', '/auth', '/invite', '/reset-password'] }],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
