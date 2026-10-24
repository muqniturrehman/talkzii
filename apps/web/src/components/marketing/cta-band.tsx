import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { siteConfig } from '@/config/site';
import { Reveal } from './motion';

export function CtaBand() {
  return (
    <section className="px-4 pb-24 sm:px-6">
      <Reveal className="mx-auto max-w-6xl">
        <div className="relative isolate overflow-hidden rounded-3xl bg-gradient-to-br from-[#6D28D9] via-[#3B1A7A] to-[#0A0A0F] px-6 py-16 text-center text-white shadow-glow-lg sm:px-12">
          <div aria-hidden className="absolute -top-24 left-1/2 -z-10 size-96 -translate-x-1/2 rounded-full bg-[#A78BFA]/40 blur-3xl" />
          <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
            Ready to run your business on WhatsApp?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-white/80">
            Connect your number in minutes and give your whole team one inbox for every customer conversation.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" asChild className="bg-white bg-none text-[#4C1D95] shadow-none hover:bg-white/90">
              <Link href="/signup">
                Start free <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild className="border-white/30 text-white hover:bg-white/10">
              <a href={`mailto:${siteConfig.emails.sales}`}>Talk to sales</a>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
