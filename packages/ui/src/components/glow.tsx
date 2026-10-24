import { cn } from '../lib/utils';

/** Decorative blurred purple glow. Place inside a `relative` container. */
export function Glow({ className, variant = 'primary' }: { className?: string; variant?: 'primary' | 'soft' }) {
  return (
    <div
      aria-hidden
      className={cn(
        'pointer-events-none absolute -z-10 rounded-full blur-3xl',
        variant === 'primary' ? 'animate-glow-pulse bg-primary/40' : 'bg-accent/20',
        className,
      )}
    />
  );
}
