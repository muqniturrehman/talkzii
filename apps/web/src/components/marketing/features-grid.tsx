import { Check } from 'lucide-react';
import { features } from '@/content/marketing';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

export function FeaturesGrid({ detailed = false }: { detailed?: boolean }) {
  return (
    <Section id="features">
      <SectionHeading
        eyebrow="Everything in one place"
        title="Built for teams that sell and support on WhatsApp"
        description="From the first hello to the repeat order — inbox, broadcasts, bots and AI working together."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((feature, index) => (
          <Reveal key={feature.title} delay={(index % 3) * 0.06}>
            <article className="glass group h-full rounded-2xl p-6 transition-all hover:-translate-y-0.5 hover:border-primary/50">
              <div className="mb-4 flex size-11 items-center justify-center rounded-xl bg-primary/15 text-primary transition group-hover:shadow-glow dark:text-accent">
                <feature.icon className="size-5" aria-hidden />
              </div>
              <h3 className="text-lg font-semibold">{feature.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{feature.description}</p>
              {detailed ? (
                <ul className="mt-4 space-y-1.5">
                  {feature.bullets.map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {bullet}
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
