import type { Metadata } from 'next';
import Link from 'next/link';
import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { safeNextPath } from '@talkzi/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { LoginForm } from '@/components/auth/login-form';
import { SupabaseNotConfigured } from '@/components/auth/not-configured';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const nextPath = safeNextPath(next);
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your Talkzi workspace."
      footer={
        <>
          New to Talkzi?{' '}
          <Link href={`/signup${next ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="font-medium text-primary hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SupabaseNotConfigured />
      {error ? (
        <Alert variant="danger" className="mb-5">
          <CircleAlert />
          <AlertDescription>{error.slice(0, 200)}</AlertDescription>
        </Alert>
      ) : null}
      <LoginForm next={nextPath} />
    </AuthCard>
  );
}
