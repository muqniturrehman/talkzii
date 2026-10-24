'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@talkzi/ui/button';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch } from '@/lib/api/client';

export function AcceptInvitation({ token }: { token: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);

  async function accept() {
    setLoading(true);
    try {
      await apiFetch('/api/invitations/accept', { body: { token } });
      toast.success('Welcome aboard! 🎉');
      router.replace('/app');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not accept the invitation.');
      setLoading(false);
    }
  }

  return (
    <Button className="w-full" onClick={accept} loading={loading}>
      Accept invitation
    </Button>
  );
}

export function SignOutButton({ redirectTo = '/login', label = 'Sign out' }: { redirectTo?: string; label?: string }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  return (
    <Button
      variant="outline"
      loading={loading}
      onClick={async () => {
        setLoading(true);
        await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
        router.replace(redirectTo);
        router.refresh();
      }}
    >
      {label}
    </Button>
  );
}
