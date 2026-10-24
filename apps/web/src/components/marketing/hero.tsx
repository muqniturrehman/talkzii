import Link from 'next/link';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Glow } from '@talkzi/ui/glow';
import { MockDashboard } from './mock-dashboard';
import { Reveal } from './motion';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden px-4 pt-16 pb-20 sm:px-6 md:pt-24">
      <Glow className="top-0 left-1/2 h-[480px] w-[720px] -translate-x-1/2 opacity-70" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-20 bg-[radial-gradient(circle_at_center,color-mix(in_oklab,var(--primary)_12%,transparent)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:radial-gradient(ellipse_at_top,black_40%,transparent_75%)]"
      />

      <div className="mx-auto max-w-6xl">
        <Reveal className="mx-auto max-w-3xl text-center">
          <span className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-success" />
            Official WhatsApp Business Cloud API · Meta Embedded Signup
          </span>
          <h1 className="mt-6 text-4xl font-extrabold tracking-tight text-balance sm:text-6xl">
            Run your business on <span className="text-brand-gradient">WhatsApp.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            One shared inbox for sales, support and marketing. Broadcast approved templates, automate with no-code
            chatbots and reply faster with AI — all on Meta’s official Cloud API. No QR codes. No ban risk.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="glass" asChild>
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">Free plan · No credit card · PKR &amp; USD pricing</p>
        </Reveal>

        <Reveal delay={0.15} className="relative mx-auto mt-14 max-w-5xl" y={32}>
          <Glow className="inset-x-10 top-10 bottom-0 opacity-60" />
          <MockDashboard />
        </Reveal>
      </div>
    </section>
  );
}
