import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, CircleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { hasMinRole } from '@talkzi/shared';
import { EmbeddedSignup } from '@/components/app/sessions/embedded-signup';
import { ManualConnect } from '@/components/app/sessions/manual-connect';
import { requireRole } from '@/lib/auth/session';
import { configured } from '@/lib/env';
import { META_SDK_VERSION, publicEnv } from '@/lib/public-env';

export const metadata: Metadata = { title: 'Connect WhatsApp' };

export default async function ConnectPage() {
  const session = await requireRole('admin', '/app/sessions/connect');
  const clientReady = Boolean(publicEnv.metaAppId && publicEnv.metaConfigId);
  const serverReady = configured.meta();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6 lg:p-8">
      <Link href="/app/sessions" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> WhatsApp numbers
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Connect WhatsApp</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Use Meta Embedded Signup to connect a WhatsApp Business number to {session.workspace.name}. Talkzi uses the
          official Cloud API — no QR codes, no app on your phone.
        </p>
      </div>

      {!clientReady || !serverReady ? (
        <Alert variant="warning">
          <CircleAlert />
          <AlertTitle>Meta app not configured</AlertTitle>
          <AlertDescription>
            Set <code>NEXT_PUBLIC_META_APP_ID</code>, <code>NEXT_PUBLIC_META_CONFIG_ID</code>, <code>META_APP_ID</code> and{' '}
            <code>META_APP_SECRET</code> in your environment. See SETUP.md → “Meta Developer app”.
          </AlertDescription>
        </Alert>
      ) : null}

      <EmbeddedSignup appId={publicEnv.metaAppId} configId={publicEnv.metaConfigId} sdkVersion={META_SDK_VERSION} disabled={!clientReady || !serverReady} />

      {hasMinRole(session.workspace.role, 'owner') ? <ManualConnect disabled={!serverReady} /> : null}
    </div>
  );
}
