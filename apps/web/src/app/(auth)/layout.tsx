import Link from 'next/link';
import { Glow } from '@talkzi/ui/glow';
import { Logo } from '@talkzi/ui/logo';
import { ThemeToggle } from '@talkzi/ui/theme-toggle';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Glow className="top-[-10%] left-1/2 h-[420px] w-[620px] -translate-x-1/2 opacity-60" />
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" aria-label="Talkzi home" className="rounded-xl">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">{children}</div>
      </main>
      <footer className="flex justify-center gap-4 px-4 py-6 text-xs text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link href="/security" className="hover:text-foreground">
          Security
        </Link>
      </footer>
    </div>
  );
}
