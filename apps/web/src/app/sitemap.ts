import type { MetadataRoute } from 'next';
import { siteConfig } from '@/config/site';
import { posts } from '@/content/blog';

const PAGES: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/compare', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/docs', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/blog', priority: 0.6, changeFrequency: 'weekly' },
  { path: '/security', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/data-deletion', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteConfig.url.replace(/\/$/, '');
  return [
    ...PAGES.map((page) => ({ url: `${base}${page.path}`, lastModified: siteConfig.legalUpdatedAt, changeFrequency: page.changeFrequency, priority: page.priority })),
    ...posts.map((post) => ({ url: `${base}/blog/${post.slug}`, lastModified: post.date, changeFrequency: 'yearly' as const, priority: 0.5 })),
  ];
}
