import * as React from 'react';
import { cn } from '../lib/utils';

export function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'flex h-10 w-full min-w-0 rounded-xl border border-input bg-background/60 px-3 py-2 text-sm text-foreground transition-colors outline-none',
        'placeholder:text-muted-foreground/70 file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring/40',
        'disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger aria-invalid:ring-danger/30',
        className,
      )}
      {...props}
    />
  );
}
