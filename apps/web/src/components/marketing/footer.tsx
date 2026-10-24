import Link from 'next/link';
import { Logo } from '@talkzi/ui/logo';
import { siteConfig } from '@/config/site';

const columns = [
  {
    title: 'Product',
    links: [
      { href: '/features', label: 'Features' },
      { href: '/pricing', label: 'Pricing' },
      { href: '/compare', label: 'Compare' },
      { href: '/docs', label: 'API docs' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/security', label: 'Security' },
      { href: `mailto:${siteConfig.emails.support}`, label: 'Contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy policy' },
      { href: '/terms', label: 'Terms of service' },
      { href: '/data-deletion', label: 'Data deletion' },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-border px-4 py-14 sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-10 md:grid-cols-[1.5fr_repeat(3,1fr)]">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm text-muted-foreground">{siteConfig.tagline} Sales, support and marketing on the official WhatsApp Cloud API.</p>
        </div>
        {columns.map((column) => (
          <nav key={column.title} aria-label={column.title}>
            <h3 className="text-sm font-semibold">{column.title}</h3>
            <ul className="mt-3 space-y-2">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-muted-foreground transition hover:text-foreground">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="mx-auto mt-12 flex max-w-6xl flex-col gap-3 border-t border-border pt-6 text-xs text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>
          © {new Date().getFullYear()} {siteConfig.legalEntity}. Made in Pakistan{' '}
          <span role="img" aria-label="Pakistan flag">
            🇵🇰
          </span>
        </p>
        <p className="max-w-xl md:text-right">
          WhatsApp is a trademark of WhatsApp LLC. Talkzi is an independent product built on the WhatsApp Business
          Platform and is not affiliated with or endorsed by Meta.
        </p>
      </div>
    </footer>
  );
}
