import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../lib/utils';

const alertVariants = cva(
  'relative grid w-full grid-cols-[0_1fr] items-start gap-y-0.5 rounded-2xl border px-4 py-3 text-sm has-[>svg]:grid-cols-[1.25rem_1fr] has-[>svg]:gap-x-3 [&>svg]:size-5 [&>svg]:translate-y-0.5',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground [&>svg]:text-primary',
        info: 'border-info/30 bg-info/10 [&>svg]:text-info',
        success: 'border-success/30 bg-success/10 [&>svg]:text-success',
        warning: 'border-warning/30 bg-warning/10 [&>svg]:text-warning',
        danger: 'border-danger/30 bg-danger/10 [&>svg]:text-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export function Alert({ className, variant, ...props }: React.ComponentProps<'div'> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" role="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('col-start-2 font-semibold tracking-tight', className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<'div'>) {
  return <div className={cn('col-start-2 text-muted-foreground [&_p]:leading-relaxed', className)} {...props} />;
}
