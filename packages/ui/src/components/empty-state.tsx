import * as React from 'react';
import { cn } from '../lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      {icon ? (
        <div className="relative mb-1">
          <div className="absolute inset-0 rounded-full bg-primary/30 blur-xl" aria-hidden />
          <div className="relative flex size-12 items-center justify-center rounded-2xl bg-primary/15 text-primary dark:text-accent [&_svg]:size-6">
            {icon}
          </div>
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
