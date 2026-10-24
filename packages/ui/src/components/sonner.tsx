'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

export { toast } from 'sonner';

/** Global toast host, themed to match Talkzi. Render once in the root layout. */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();
  return (
    <Sonner
      theme={(resolvedTheme as ToasterProps['theme']) ?? 'dark'}
      position="top-right"
      richColors
      closeButton
      toastOptions={{
        classNames: {
          toast: 'rounded-2xl border border-border bg-popover text-popover-foreground shadow-glow-lg',
          description: 'text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}
