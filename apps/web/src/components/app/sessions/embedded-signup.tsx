'use client';

import * as React from 'react';
import Script from 'next/script';
import { useRouter } from 'next/navigation';
import { CheckCircle2, CircleAlert, KeyRound, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { apiFetch } from '@/lib/api/client';

interface SessionInfo {
  wabaId?: string;
  phoneNumberId?: string;
}

type Status =
  | { kind: 'idle' }
  | { kind: 'popup' }
  | { kind: 'exchanging' }
  | { kind: 'done'; numbers: string[]; warnings: string[] }
  | { kind: 'cancelled'; step?: string }
  | { kind: 'error'; message: string };

interface ExchangeResult {
  waba: { name: string | null };
  phoneNumbers: { displayPhoneNumber: string }[];
  warnings: string[];
}

function FacebookGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="size-4 fill-current">
      <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.87.25-1.46 1.5-1.46h1.6V4.46A21 21 0 0 0 14.27 4.3c-2.3 0-3.87 1.4-3.87 3.97v2.23H7.9v3h2.5V21h3.1Z" />
    </svg>
  );
}

const FINISH_EVENTS = new Set(['FINISH', 'FINISH_ONLY_WABA', 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING']);

function randomPin(): string {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String((values[0] ?? 0) % 1_000_000).padStart(6, '0');
}

/**
 * Meta Embedded Signup (FB JS SDK v21.0, sessionInfoVersion 2):
 * FB.login(config_id) → popup → `WA_EMBEDDED_SIGNUP` postMessage with the
 * WABA / phone number ids → auth `code` → POST /api/meta/exchange-code.
 */
export function EmbeddedSignup({
  appId,
  configId,
  sdkVersion,
  disabled,
}: {
  appId: string;
  configId: string;
  sdkVersion: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [sdkReady, setSdkReady] = React.useState(false);
  const [status, setStatus] = React.useState<Status>({ kind: 'idle' });
  const [pin, setPin] = React.useState(randomPin);
  const sessionInfo = React.useRef<SessionInfo | null>(null);

  React.useEffect(() => {
    window.fbAsyncInit = () => {
      window.FB?.init({ appId, autoLogAppEvents: true, xfbml: true, version: sdkVersion });
      setSdkReady(true);
    };
    if (window.FB) window.fbAsyncInit();

    const onMessage = (event: MessageEvent) => {
      if (!/(^|\.)facebook\.com$/.test(new URL(event.origin).hostname)) return;
      let data: { type?: string; event?: string; data?: Record<string, string> } | null = null;
      try {
        data = typeof event.data === 'string' ? JSON.parse(event.data) : (event.data as typeof data);
      } catch {
        return;
      }
      if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (data.event && FINISH_EVENTS.has(data.event)) {
        sessionInfo.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
      } else if (data.event === 'CANCEL') {
        setStatus({ kind: 'cancelled', step: data.data?.current_step });
      } else if (data.event === 'ERROR') {
        setStatus({ kind: 'error', message: data.data?.error_message ?? 'Meta reported an error during signup.' });
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [appId, sdkVersion]);

  const exchange = React.useCallback(
    async (code: string, fbUserId?: string) => {
      setStatus({ kind: 'exchanging' });
      // The session-info message can land a moment after the login callback.
      for (let i = 0; i < 20 && !sessionInfo.current; i += 1) await new Promise((r) => setTimeout(r, 150));
      try {
        const result = await apiFetch<ExchangeResult>('/api/meta/exchange-code', {
          body: {
            code,
            wabaId: sessionInfo.current?.wabaId,
            phoneNumberId: sessionInfo.current?.phoneNumberId,
            pin: /^\d{6}$/.test(pin) ? pin : undefined,
            fbUserId: fbUserId || undefined,
          },
        });
        setStatus({ kind: 'done', numbers: result.phoneNumbers.map((p) => p.displayPhoneNumber), warnings: result.warnings });
        router.refresh();
      } catch (error) {
        setStatus({ kind: 'error', message: error instanceof Error ? error.message : 'Could not complete signup.' });
      }
    },
    [pin, router],
  );

  function launch() {
    if (!window.FB) return;
    sessionInfo.current = null;
    setStatus({ kind: 'popup' });
    window.FB.login(
      (response) => {
        const code = response.authResponse?.code;
        if (code) void exchange(code, response.authResponse?.userID);
        else setStatus((s) => (s.kind === 'popup' ? { kind: 'cancelled' } : s));
      },
      {
        config_id: configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { setup: {}, feature: 'whatsapp_embedded_signup', sessionInfoVersion: '2' },
      },
    );
  }

  const busy = status.kind === 'popup' || status.kind === 'exchanging';

  return (
    <Card variant="glass">
      {appId ? (
        <Script
          id="facebook-jssdk"
          src="https://connect.facebook.net/en_US/sdk.js"
          strategy="afterInteractive"
          crossOrigin="anonymous"
          onLoad={() => window.fbAsyncInit?.()}
        />
      ) : null}
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-success" /> Embedded Signup
        </CardTitle>
        <CardDescription>
          You’ll sign in with Facebook, choose or create your Meta Business portfolio, and verify your phone number
          with a code by SMS or voice call.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <ol className="grid gap-3 text-sm sm:grid-cols-3">
          {['Sign in with Facebook', 'Pick business + WhatsApp account', 'Verify your number'].map((step, i) => (
            <li key={step} className="flex items-center gap-2 rounded-xl border border-border p-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary dark:text-accent">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        <div className="space-y-2 rounded-2xl border border-border p-4">
          <Label htmlFor="signup-pin" className="flex items-center gap-2">
            <KeyRound className="size-4" /> Two-step verification PIN
          </Label>
          <div className="flex gap-2">
            <Input
              id="signup-pin"
              inputMode="numeric"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              className="max-w-40 font-mono tracking-widest"
              aria-describedby="signup-pin-help"
              suppressHydrationWarning
            />
            <Button type="button" variant="ghost" size="icon" aria-label="Generate a new PIN" onClick={() => setPin(randomPin())}>
              <RefreshCw />
            </Button>
          </div>
          <p id="signup-pin-help" className="text-xs text-muted-foreground">
            Used to register your number on the Cloud API right after signup. Save it somewhere safe.
          </p>
        </div>

        {status.kind === 'done' ? (
          <Alert variant="success">
            <CheckCircle2 />
            <AlertTitle>WhatsApp connected</AlertTitle>
            <AlertDescription>
              {status.numbers.length ? `Connected ${status.numbers.join(', ')}.` : 'Your account is connected.'}
              {status.warnings.length ? (
                <ul className="mt-2 list-disc pl-4">
                  {status.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        {status.kind === 'error' ? (
          <Alert variant="danger">
            <CircleAlert />
            <AlertTitle>Signup didn’t complete</AlertTitle>
            <AlertDescription>{status.message}</AlertDescription>
          </Alert>
        ) : null}
        {status.kind === 'cancelled' ? (
          <Alert variant="warning">
            <CircleAlert />
            <AlertDescription>
              Signup was closed{status.step ? ` at “${status.step.toLowerCase().replace(/_/g, ' ')}”` : ''}. You can start
              again anytime.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-wrap gap-3">
          {status.kind === 'done' ? (
            <Button onClick={() => router.push('/app/sessions')}>View numbers</Button>
          ) : (
            <Button size="lg" onClick={launch} disabled={disabled || !sdkReady || busy || pin.length !== 6}>
              {busy ? <Loader2 className="animate-spin" /> : <FacebookGlyph />}
              {status.kind === 'exchanging' ? 'Finishing setup…' : status.kind === 'popup' ? 'Waiting for Meta…' : 'Connect WhatsApp'}
            </Button>
          )}
          {!sdkReady && !disabled ? <p className="self-center text-xs text-muted-foreground">Loading Facebook SDK…</p> : null}
        </div>
      </CardContent>
    </Card>
  );
}
