import type { Metadata } from 'next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { NewPasswordForm } from '@/components/auth/password-forms';
import { ProfileForm } from '@/components/app/settings/profile-form';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Profile' };

export default async function ProfileSettingsPage() {
  const session = await requireWorkspace('/app/settings/profile');
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
          <CardDescription>How teammates and customers see you in Talkzi.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            userId={session.user.id}
            email={session.user.email}
            fullName={session.profile?.full_name ?? ''}
            avatarUrl={session.profile?.avatar_url ?? null}
            workspaceId={session.workspace.id}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Password</CardTitle>
          <CardDescription>Use at least 8 characters. Signing in with Google or a magic link works too.</CardDescription>
        </CardHeader>
        <CardContent className="max-w-md">
          <NewPasswordForm endpoint="/api/profile/password" submitLabel="Change password" />
        </CardContent>
      </Card>
    </div>
  );
}
