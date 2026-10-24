import * as React from 'react';
import { cn } from '../lib/utils';

export function StatCard({
  label,
  value,
  hint,
  icon,
  trend,
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ReactNode;
  trend?: { value: string; positive?: boolean };
  className?: string;
}) {
  return (
    <div className={cn('glass rounded-2xl p-5 transition-colors hover:border-primary/50', className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon ? (
          <div className="flex size-9 items-center justify-center rounded-xl bg-primary/15 text-primary dark:text-accent [&_svg]:size-4">
            {icon}
          </div>
        ) : null}
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight tabular-nums">{value}</p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {trend ? (
          <span className={cn('font-semibold', trend.positive ? 'text-success' : 'text-danger')}>{trend.value}</span>
        ) : null}
        {hint ? <span className="text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}
