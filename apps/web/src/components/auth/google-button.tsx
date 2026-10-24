'use client';

import * as React from 'react';
import { Button } from '@talkzi/ui/button';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch } from '@/lib/api/client';

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4">
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.74-6-6.1s2.7-6.1 6-6.1c1.9 0 3.15.8 3.87 1.5l2.64-2.54C16.9 3.4 14.7 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12s4.3 9.6 9.6 9.6c5.54 0 9.2-3.9 9.2-9.38 0-.63-.07-1.1-.16-1.6H12Z" />
      <path fill="#34A853" d="M3.5 7.5 6.7 9.85C7.56 7.7 9.6 6.2 12 6.2c1.9 0 3.15.8 3.87 1.5l2.64-2.54C16.9 3.4 14.7 2.4 12 2.4 8.3 2.4 5.1 4.5 3.5 7.5Z" opacity=".001" />
      <path fill="#4285F4" d="M21.2 12.22c0-.63-.07-1.1-.16-1.6H12v3.9h5.5c-.26 1.3-1.04 2.4-2.2 3.14l3.4 2.64c1.98-1.83 2.5-4.53 2.5-8.08Z" />
      <path fill="#FBBC05" d="M6.1 14.3a5.9 5.9 0 0 1 0-4.6L2.86 7.2a9.6 9.6 0 0 0 0 9.6l3.24-2.5Z" />
      <path fill="#34A853" d="M12 21.6c2.6 0 4.78-.86 6.37-2.32l-3.1-2.4c-.86.6-2 1.02-3.27 1.02-2.5 0-4.6-1.68-5.36-3.95l-3.3 2.55A9.6 9.6 0 0 0 12 21.6Z" />
    </svg>
  );
}

export function GoogleButton({ next, label = 'Continue with Google' }: { next?: string; label?: string }) {
  const [loading, setLoading] = React.useState(false);

  async function start() {
    setLoading(true);
    try {
      const { url } = await apiFetch<{ url: string }>('/api/auth/oauth', { body: { provider: 'google', next } });
      window.location.assign(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not start Google sign-in.');
      setLoading(false);
    }
  }

  return (
    <Button type="button" variant="outline" className="w-full" onClick={start} loading={loading}>
      {loading ? null : <GoogleIcon />}
      {label}
    </Button>
  );
}
