'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Logo } from '@talkzi/ui/logo';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@talkzi/ui/sheet';
import { ThemeToggle } from '@talkzi/ui/theme-toggle';
import { cn } from '@talkzi/ui/lib/utils';
import { marketingNav } from '@/config/site';

export function Navbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className={cn(
        'sticky top-0 z-40 w-full border-b transition-colors duration-300',
        scrolled ? 'border-border bg-background/70 backdrop-blur-md' : 'border-transparent bg-transparent',
      )}
    >
      <a
        href="#main"
        className="sr-only rounded-lg bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:absolute focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="Main">
        <Link href="/" aria-label="Talkzi home" className="rounded-xl">
          <Logo />
        </Link>

        <ul className="hidden items-center gap-1 md:flex">
          {marketingNav.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:text-foreground',
                  pathname === item.href && 'text-foreground',
                )}
                aria-current={pathname === item.href ? 'page' : undefined}
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-1 sm:gap-2">
          <ThemeToggle />
          <Button variant="ghost" asChild className="hidden sm:inline-flex">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild className="hidden sm:inline-flex">
            <Link href="/signup">Start free</Link>
          </Button>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-72">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Logo />
              <ul className="mt-6 flex flex-col gap-1">
                {marketingNav.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block rounded-xl px-3 py-2.5 text-base font-medium hover:bg-primary/10"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-col gap-2">
                <Button variant="outline" asChild>
                  <Link href="/login">Login</Link>
                </Button>
                <Button asChild>
                  <Link href="/signup">Start free</Link>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </nav>
    </header>
  );
}
