'use client';

import * as React from 'react';
import { cn } from '../lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: React.ReactNode;
}

/** Accessible two-or-more option toggle (radiogroup), e.g. PKR / USD. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SegmentedOption<T>[];
  label: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + options.length) % options.length;
    const option = options[next];
    if (option) {
      onValueChange(option.value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div role="radiogroup" aria-label={label} className={cn('inline-flex rounded-xl bg-muted p-1', className)}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={cn(
              'rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
