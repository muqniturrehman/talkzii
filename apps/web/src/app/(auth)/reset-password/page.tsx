import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AuthCard } from '@/components/auth/auth-card';
import { NewPasswordForm } from '@/components/auth/password-forms';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Choose a new password' };

export default async function ResetPasswordPage() {
  const session = await getSession();
  if (!session) redirect('/forgot-password');
  return (
    <AuthCard title="Choose a new password" description={`For ${session.user.email ?? 'your account'}`}>
      <NewPasswordForm redirectTo="/app" />
    </AuthCard>
  );
}
