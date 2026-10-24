'use client';

import * as React from 'react';
import { Avatar as AvatarPrimitive } from 'radix-ui';
import { initials } from '../lib/initials';
import { cn } from '../lib/utils';

export function Avatar({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Root>) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      className={cn('relative flex size-9 shrink-0 overflow-hidden rounded-full', className)}
      {...props}
    />
  );
}

export function AvatarImage({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Image>) {
  return <AvatarPrimitive.Image className={cn('aspect-square size-full object-cover', className)} {...props} />;
}

export function AvatarFallback({ className, ...props }: React.ComponentProps<typeof AvatarPrimitive.Fallback>) {
  return (
    <AvatarPrimitive.Fallback
      className={cn(
        'flex size-full items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary dark:text-accent',
        className,
      )}
      {...props}
    />
  );
}

/** Avatar with image + initials fallback in one line. */
export function UserAvatar({
  name,
  src,
  className,
}: {
  name: string | null | undefined;
  src?: string | null;
  className?: string;
}) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name ?? ''} /> : null}
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
