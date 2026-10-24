import Link from 'next/link';
import { Glow } from '@talkzi/ui/glow';
import { Logo } from '@talkzi/ui/logo';
import { ThemeToggle } from '@talkzi/ui/theme-toggle';

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col overflow-hidden">
      <Glow className="top-[-10%] left-1/2 h-[420px] w-[620px] -translate-x-1/2 opacity-50" />
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="rounded-xl" aria-label="Talkzi home">
          <Logo />
        </Link>
        <ThemeToggle />
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-lg">{children}</div>
      </main>
    </div>
  );
}
