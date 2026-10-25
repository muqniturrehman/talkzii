'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Globe, RefreshCw, Trash2 } from 'lucide-react';
import { customDomainSchema } from '@talkzi/shared';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@talkzi/ui/alert-dialog';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { toast } from '@talkzi/ui/sonner';
import { CopyField } from '@/components/app/integrations/copy-field';
import { apiFetch } from '@/lib/api/client';
import type { DnsCheck, DomainStatus } from '@/lib/custom-domain';

type VerifyResult = DomainStatus & { dns: DnsCheck; hosting: { attached: boolean; message: string } | null };

export function DomainSettings({ initial }: { initial: DomainStatus }) {
  const [status, setStatus] = React.useState(initial);
  const [draft, setDraft] = React.useState(initial.domain ?? '');
  const [check, setCheck] = React.useState<VerifyResult | null>(null);
  const [busy, setBusy] = React.useState<'save' | 'verify' | 'remove' | null>(null);

  const save = async (domain: string | null) => {
    if (domain !== null) {
      const parsed = customDomainSchema.safeParse(domain);
      if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Enter a valid domain.');
      domain = parsed.data;
    }
    setBusy(domain === null ? 'remove' : 'save');
    try {
      const next = await apiFetch<DomainStatus>('/api/workspaces/current/domain', { method: 'PUT', body: { domain } });
      setStatus(next);
      setDraft(next.domain ?? '');
      setCheck(null);
      toast.success(domain ? 'Domain saved — add the DNS records below.' : 'Custom domain removed.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the domain.');
    } finally {
      setBusy(null);
    }
  };

  const verify = async () => {
    setBusy('verify');
    try {
      const result = await apiFetch<VerifyResult>('/api/workspaces/current/domain/verify', { method: 'POST' });
      setCheck(result);
      setStatus(result);
      if (result.verifiedAt && result.dns.txtVerified) toast.success('Domain verified.');
      else if (!result.dns.txtVerified) toast.error('TXT record not found yet — DNS changes can take a while to propagate.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Verification failed.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          void save(draft);
        }}
      >
        <div className="flex-1 space-y-1.5">
          <Label htmlFor="custom-domain">Domain</Label>
          <Input id="custom-domain" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="app.youragency.com" inputMode="url" autoComplete="off" />
        </div>
        <Button type="submit" loading={busy === 'save'} disabled={!draft.trim() || draft.trim().toLowerCase() === status.domain}>
          Save domain
        </Button>
      </form>

      {status.domain ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Globe className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-medium">{status.domain}</span>
            {status.verifiedAt ? (
              <Badge variant="success">
                <CheckCircle2 /> Verified
              </Badge>
            ) : (
              <Badge variant="warning">
                <AlertTriangle /> Waiting for DNS
              </Badge>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Add these records at your DNS provider, then check:</p>
            {status.records.map((record) => (
              <div key={record.type} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[72px_1fr]">
                <Badge variant="outline" className="h-fit">
                  {record.type}
                </Badge>
                <div className="grid gap-2 sm:grid-cols-2">
                  <CopyField value={record.name} label={`${record.type} name`} />
                  <CopyField value={record.value} label={`${record.type} value`} secret />
                </div>
              </div>
            ))}
          </div>

          {check ? (
            <ul className="space-y-1 text-sm" aria-label="DNS check results">
              <li className="flex items-center gap-2">
                {check.dns.txtVerified ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <AlertTriangle className="size-4 text-warning" aria-hidden />}
                TXT ownership record {check.dns.txtVerified ? 'found' : 'not found yet'}
              </li>
              <li className="flex items-center gap-2">
                {check.dns.pointsToTalkzi ? <CheckCircle2 className="size-4 text-success" aria-hidden /> : <AlertTriangle className="size-4 text-warning" aria-hidden />}
                CNAME {check.dns.cname ? `points to ${check.dns.cname}` : 'not found'}
                {check.dns.pointsToTalkzi ? '' : ` (expected ${status.records.find((r) => r.type === 'CNAME')?.value})`}
              </li>
              {check.hosting ? <li className="text-muted-foreground">{check.hosting.message}</li> : null}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={() => void verify()} loading={busy === 'verify'}>
              <RefreshCw /> Check DNS
            </Button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="ghost" loading={busy === 'remove'}>
                  <Trash2 /> Remove domain
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Remove {status.domain}?</AlertDialogTitle>
                  <AlertDialogDescription>Clients signing in there will no longer see your branding. You can add it again later.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction destructive onClick={() => void save(null)}>
                    Remove
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </>
      ) : null}

      <Alert variant="info">
        <AlertDescription>
          Once verified, your clients sign in at <code className="text-xs">https://{status.domain ?? 'app.youragency.com'}/login</code> and see your brand instead of
          Talkzi. HTTPS certificates are issued automatically by the hosting platform.
        </AlertDescription>
      </Alert>
    </div>
  );
}
