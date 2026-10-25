'use client';

import * as React from 'react';
import Link from 'next/link';
import { RotateCcw } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Logo } from '@talkzi/ui/logo';

/** Error boundary for public pages (500). The digest matches the server log entry. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center gap-6 px-4 text-center">
      <Logo />
      <div className="space-y-2">
        <p className="text-brand-gradient text-6xl font-bold tracking-tight">500</p>
        <h1 className="text-2xl font-semibold">Something went wrong on our side</h1>
        <p className="max-w-md text-muted-foreground">
          Please try again. If it keeps happening, contact support{error.digest ? ` and mention reference ${error.digest}` : ''}.
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/">Go to homepage</Link>
        </Button>
      </div>
    </main>
  );
}
