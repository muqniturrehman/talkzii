import * as React from 'react';
import { cn } from '../lib/utils';

/** Talkzi mark: a speech bubble with a "z" spark, in the brand gradient. */
export function LogoMark({ className, title = 'Talkzi' }: { className?: string; title?: string }) {
  const id = React.useId();
  return (
    <svg viewBox="0 0 40 40" className={cn('size-8', className)} role="img" aria-label={title}>
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#A78BFA" />
          <stop offset="0.5" stopColor="#8B5CF6" />
          <stop offset="1" stopColor="#6D28D9" />
        </linearGradient>
      </defs>
      <path
        d="M20 3C10.6 3 3 10.1 3 18.9c0 4.6 2.1 8.8 5.5 11.7L7 37l7.1-3.4c1.9.6 3.9.9 5.9.9 9.4 0 17-7.1 17-15.8S29.4 3 20 3Z"
        fill={`url(#${id}-g)`}
      />
      <path d="M13.5 13.5h13l-9.8 11h10" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({
  className,
  name = 'Talkzi',
  logoUrl,
}: {
  className?: string;
  /** White-label brand name (agency workspaces). */
  name?: string;
  logoUrl?: string | null;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 font-bold tracking-tight', className)}>
      {logoUrl ? (
        <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" />
      ) : (
        <LogoMark />
      )}
      <span className="text-lg">{name}</span>
    </span>
  );
}
