/**
 * Public company details used across the marketing site and legal pages.
 * TODO(before launch): replace the legal entity, address and emails.
 */
export const siteConfig = {
  name: 'Talkzi',
  tagline: 'Run your business on WhatsApp.',
  description:
    'Talkzi is a shared WhatsApp inbox, broadcast, chatbot and AI platform built on the official WhatsApp Business Cloud API.',
  url: process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
  legalEntity: 'Talkzi (Private) Limited',
  address: 'Office 12, Software Technology Park, Islamabad, Pakistan',
  emails: {
    support: 'support@talkzi.app',
    sales: 'sales@talkzi.app',
    privacy: 'privacy@talkzi.app',
    security: 'security@talkzi.app',
  },
  social: {
    x: 'https://x.com/talkzi',
    linkedin: 'https://www.linkedin.com/company/talkzi',
  },
  legalUpdatedAt: '2026-10-24',
} as const;

export const marketingNav = [
  { href: '/features', label: 'Features' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/compare', label: 'Compare' },
  { href: '/docs', label: 'Docs' },
  { href: '/blog', label: 'Blog' },
] as const;
