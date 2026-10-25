import { headers } from 'next/headers';
import Link from 'next/link';
import { Glow } from '@talkzi/ui/glow';
import { Logo } from '@talkzi/ui/logo';
import { ThemeToggle } from '@talkzi/ui/theme-toggle';
import { brandingStyle } from '@/lib/branding';
import { brandingForHost } from '@/lib/branding-server';

/**
 * Auth pages. On an agency's verified custom domain they carry the agency's
 * brand (name, logo, colours) instead of Talkzi's.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const brand = await brandingForHost((await headers()).get('host'));
  const branding = brand?.branding ?? {};
  const css = brand ? brandingStyle(branding) : null;
  const logo = <Logo name={branding.brandName ?? brand?.workspaceName ?? 'Talkzi'} logoUrl={branding.logoUrl} />;

  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      {css ? <style dangerouslySetInnerHTML={{ __html: css }} /> : null}
      <Glow className="top-[-10%] left-1/2 h-[420px] w-[620px] -translate-x-1/2 opacity-60" />
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        {brand ? (
          logo
        ) : (
          <Link href="/" aria-label="Talkzi home" className="rounded-xl">
            {logo}
          </Link>
        )}
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="flex flex-wrap justify-center gap-4 px-4 py-6 text-xs text-muted-foreground">
        {branding.supportEmail ? (
          <a href={`mailto:${branding.supportEmail}`} className="hover:text-foreground">
            {branding.supportEmail}
          </a>
        ) : null}
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        {brand ? null : (
          <Link href="/security" className="hover:text-foreground">
            Security
          </Link>
        )}
        {brand && !branding.hidePoweredBy ? <span>Powered by Talkzi</span> : null}
      </footer>
    </div>
  );
}
