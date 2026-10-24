import { Check, Minus, X } from 'lucide-react';
import { cn } from '@talkzi/ui/lib/utils';
import { compareCompetitors, compareRows, type CompareValue } from '@/content/marketing';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

function Cell({ value }: { value: CompareValue }) {
  if (value === 'yes') {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-success/15 text-success">
        <Check className="size-4" aria-hidden />
        <span className="sr-only">Yes</span>
      </span>
    );
  }
  if (value === 'partial') {
    return (
      <span className="inline-flex size-6 items-center justify-center rounded-full bg-warning/15 text-warning">
        <Minus className="size-4" aria-hidden />
        <span className="sr-only">Partial or varies by plan</span>
      </span>
    );
  }
  return (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground">
      <X className="size-3.5" aria-hidden />
      <span className="sr-only">No</span>
    </span>
  );
}

export function CompareTable() {
  return (
    <Section id="compare">
      <SectionHeading
        eyebrow="Compare"
        title="Made for Pakistan. Ready for the world."
        description="How Talkzi stacks up against popular WhatsApp platforms."
      />
      <Reveal>
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">Feature comparison between Talkzi and other WhatsApp platforms</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-4 text-left font-semibold text-muted-foreground">
                  Feature
                </th>
                {compareCompetitors.map((name, i) => (
                  <th
                    key={name}
                    scope="col"
                    className={cn('px-4 py-4 text-center font-semibold', i === 0 && 'text-primary dark:text-accent')}
                  >
                    {name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {compareRows.map((row) => (
                <tr key={row.feature} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3.5 text-left font-medium">
                    {row.feature}
                  </th>
                  {row.values.map((value, i) => (
                    <td key={i} className={cn('px-4 py-3.5 text-center', i === 0 && 'bg-primary/5')}>
                      <Cell value={value} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Competitor information is based on publicly available sources and may change. “Partial” means it varies by
          plan or is an add-on. Trademarks belong to their owners.
        </p>
      </Reveal>
    </Section>
  );
}
