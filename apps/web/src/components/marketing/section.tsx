import * as React from 'react';
import { cn } from '@talkzi/ui/lib/utils';
import { Reveal } from './motion';

export function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('relative scroll-mt-24 px-4 py-20 sm:px-6 md:py-28', className)}>
      <div className="mx-auto max-w-6xl">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  className,
}: {
  eyebrow?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}) {
  return (
    <Reveal className={cn('mx-auto mb-12 max-w-2xl text-center', className)}>
      {eyebrow ? (
        <p className="mb-3 text-sm font-semibold tracking-wide text-primary uppercase dark:text-accent">{eyebrow}</p>
      ) : null}
      <h2 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">{title}</h2>
      {description ? <p className="mt-4 text-lg text-pretty text-muted-foreground">{description}</p> : null}
    </Reveal>
  );
}
