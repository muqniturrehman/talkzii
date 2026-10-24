'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';

type Status = { status: string; requestedAt: string; completedAt: string | null } | null;

export function DeletionStatusLookup() {
  const searchParams = useSearchParams();
  const [code, setCode] = React.useState(() => searchParams.get('code') ?? '');
  const [result, setResult] = React.useState<Status>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  async function lookup(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/compliance/deletion-status?code=${encodeURIComponent(code.trim())}`);
      const body = (await res.json()) as { data?: NonNullable<Status>; error?: { message: string } };
      if (!res.ok || !body.data) throw new Error(body.error?.message ?? 'Request not found');
      setResult(body.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={lookup} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="flex-1 space-y-2">
        <Label htmlFor="deletion-code">Confirmation code</Label>
        <Input
          id="deletion-code"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. DEL-7K2M9Q"
          required
          autoComplete="off"
        />
      </div>
      <Button type="submit" loading={loading}>
        Check status
      </Button>
      <div className="sm:basis-full" aria-live="polite">
        {result ? (
          <p className="text-sm">
            Status: <strong className="capitalize">{result.status}</strong> · requested{' '}
            {new Date(result.requestedAt).toLocaleDateString('en-GB')}
            {result.completedAt ? ` · completed ${new Date(result.completedAt).toLocaleDateString('en-GB')}` : ''}
          </p>
        ) : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
      </div>
    </form>
  );
}
