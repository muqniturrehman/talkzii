import type { Metadata } from 'next';
import Link from 'next/link';
import { safeNextPath } from '@talkzi/shared';
import { AuthCard } from '@/components/auth/auth-card';
import { SupabaseNotConfigured } from '@/components/auth/not-configured';
import { SignupForm } from '@/components/auth/signup-form';

export const metadata: Metadata = { title: 'Create your account' };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string; plan?: string }>;
}) {
  const { next, email, plan } = await searchParams;
  const fallback = plan && plan !== 'free' ? `/onboarding?plan=${encodeURIComponent(plan)}` : '/onboarding';
  const nextPath = safeNextPath(next, fallback);

  return (
    <AuthCard
      title="Start free"
      description="Run your business on WhatsApp in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link href={`/login${next ? `?next=${encodeURIComponent(nextPath)}` : ''}`} className="font-medium text-primary hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SupabaseNotConfigured />
      <SignupForm next={nextPath} defaultEmail={email?.slice(0, 254) ?? ''} />
    </AuthCard>
  );
}
