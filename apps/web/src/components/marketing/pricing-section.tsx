'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { SegmentedControl } from '@talkzi/ui/segmented-control';
import { cn } from '@talkzi/ui/lib/utils';
import { formatPrice, PLAN_ORDER, PLANS, type BillingInterval, type Currency } from '@talkzi/shared';
import { Reveal } from './motion';
import { Section, SectionHeading } from './section';

export function PricingSection({ defaultCurrency = 'PKR' }: { defaultCurrency?: Currency }) {
  const [currency, setCurrency] = React.useState<Currency>(defaultCurrency);
  const [interval, setInterval] = React.useState<BillingInterval>('month');

  return (
    <Section id="pricing">
      <SectionHeading
        eyebrow="Pricing"
        title="Simple plans in PKR or USD"
        description="Start free. Upgrade when your team grows. WhatsApp conversation fees are billed by Meta at cost."
      />

      <div className="mb-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <SegmentedControl
          label="Currency"
          value={currency}
          onValueChange={setCurrency}
          options={[
            { value: 'PKR', label: 'PKR' },
            { value: 'USD', label: 'USD' },
          ]}
        />
        <SegmentedControl
          label="Billing interval"
          value={interval}
          onValueChange={setInterval}
          options={[
            { value: 'month', label: 'Monthly' },
            { value: 'year', label: 'Yearly · save ~20%' },
          ]}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {PLAN_ORDER.map((id, index) => {
          const plan = PLANS[id];
          const amount = plan.price[currency][interval];
          return (
            <Reveal key={id} delay={index * 0.08}>
              <article
                className={cn(
                  'relative flex h-full flex-col rounded-2xl p-6',
                  plan.popular ? 'border-2 border-primary bg-card shadow-glow-lg' : 'glass',
                )}
              >
                {plan.popular ? (
                  <Badge className="absolute -top-3 left-6 bg-brand-gradient text-white">Most popular</Badge>
                ) : null}
                <h3 className="text-lg font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{plan.tagline}</p>
                <p className="mt-6 flex items-baseline gap-1">
                  <span className="text-4xl font-extrabold tracking-tight tabular-nums">{formatPrice(amount, currency)}</span>
                  <span className="text-sm text-muted-foreground">/ month</span>
                </p>
                <p className="mt-1 h-4 text-xs text-muted-foreground">
                  {amount > 0 && interval === 'year' ? `Billed yearly (${formatPrice(amount * 12, currency)})` : null}
                </p>
                <ul className="my-6 flex-1 space-y-2.5">
                  {plan.highlights.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
                <Button variant={plan.popular ? 'default' : 'outline'} asChild className="w-full">
                  <Link href={`/signup?plan=${id}&currency=${currency}&interval=${interval}`}>
                    {id === 'free' ? 'Start free' : `Choose ${plan.name}`}
                  </Link>
                </Button>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
