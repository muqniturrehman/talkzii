import { BadgeCheck } from 'lucide-react';
import { trustLogos } from '@/content/marketing';

export function TrustRow() {
  return (
    <section aria-label="Trusted by" className="border-y border-border/60 px-4 py-10 sm:px-6">
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-8 md:flex-row md:justify-between">
        {/* Placeholder until Meta Tech Provider / Business Partner status is granted. */}
        <div className="glass flex items-center gap-3 rounded-2xl px-4 py-3">
          <BadgeCheck className="size-6 text-primary dark:text-accent" />
          <div className="text-left">
            <p className="text-xs text-muted-foreground">Built on the</p>
            <p className="text-sm font-semibold">WhatsApp Business Platform</p>
          </div>
        </div>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {trustLogos.map((name) => (
            <li
              key={name}
              className="text-lg font-bold tracking-tight text-muted-foreground/60 grayscale transition hover:text-muted-foreground"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
