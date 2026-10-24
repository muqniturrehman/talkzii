import { Quote } from 'lucide-react';
import { initials } from '@talkzi/ui/lib/initials';
import { testimonials } from '@/content/marketing';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

export function Testimonials() {
  return (
    <Section id="testimonials">
      <SectionHeading eyebrow="Loved by teams" title="Businesses that moved to Talkzi" />
      <div className="grid gap-6 md:grid-cols-3">
        {testimonials.map((t, index) => (
          <Reveal key={t.name} delay={index * 0.08}>
            <figure className="glass flex h-full flex-col rounded-2xl p-6">
              <Quote className="size-6 text-primary dark:text-accent" aria-hidden />
              <blockquote className="mt-4 flex-1 text-sm leading-relaxed">“{t.quote}”</blockquote>
              <figcaption className="mt-6 flex items-center gap-3">
                <span className="flex size-10 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary dark:text-accent">
                  {initials(t.name)}
                </span>
                <span>
                  <span className="block text-sm font-semibold">{t.name}</span>
                  <span className="block text-xs text-muted-foreground">{t.role}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
