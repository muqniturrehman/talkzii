'use client';

import * as React from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent } from '@talkzi/ui/card';

/** Dashboard error boundary: the sidebar stays usable while this section recovers. */
export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6 lg:p-8">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-warning" aria-hidden />
          <h1 className="text-xl font-semibold">This page hit a problem</h1>
          <p className="max-w-md text-sm text-muted-foreground">
            Your data is safe. Try again, or go back to the overview{error.digest ? ` (reference ${error.digest})` : ''}.
          </p>
          <div className="mt-2 flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>
              <RotateCcw /> Try again
            </Button>
            <Button asChild variant="outline">
              <Link href="/app">Back to overview</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
