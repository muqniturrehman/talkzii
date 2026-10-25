import type { Metadata } from 'next';
import Link from 'next/link';
import { Button } from '@talkzi/ui/button';
import { Glow } from '@talkzi/ui/glow';
import { Logo } from '@talkzi/ui/logo';

export const metadata: Metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main id="main" className="relative isolate flex min-h-dvh flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center">
      <Glow className="top-[-15%] left-1/2 h-[420px] w-[620px] -translate-x-1/2 opacity-50" />
      <Link href="/" aria-label="Talkzi home" className="rounded-xl">
        <Logo />
      </Link>
      <div className="space-y-2">
        <p className="text-brand-gradient text-7xl font-bold tracking-tight">404</p>
        <h1 className="text-2xl font-semibold">This page went off the chat</h1>
        <p className="max-w-md text-muted-foreground">The link may be broken or the page may have moved. Check the address, or head somewhere useful.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/app">Open dashboard</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go to homepage</Link>
        </Button>
      </div>
    </main>
  );
}
