import { steps } from '@/content/marketing';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

export function HowItWorks() {
  return (
    <Section id="how-it-works">
      <SectionHeading
        eyebrow="How it works"
        title="Live on WhatsApp in three steps"
        description="No developers, no QR codes, no waiting weeks for approval."
      />
      <ol className="grid gap-6 md:grid-cols-3">
        {steps.map((step, index) => (
          <Reveal key={step.title} delay={index * 0.1}>
            <li className="relative h-full list-none rounded-2xl border border-border p-6">
              <span className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-sm font-bold text-white shadow-glow">
                {index + 1}
              </span>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
            </li>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}
