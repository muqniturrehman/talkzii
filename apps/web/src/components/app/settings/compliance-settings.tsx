'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Download, ShieldCheck, X } from 'lucide-react';
import { complianceSettingsSchema, matchOptKeyword, RETENTION_OPTIONS, type ComplianceSettings } from '@talkzi/shared';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Textarea } from '@talkzi/ui/textarea';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch } from '@/lib/api/client';

function KeywordList({ id, label, values, onChange }: { id: string; label: string; values: string[]; onChange: (next: string[]) => void }) {
  const [draft, setDraft] = React.useState('');
  const add = () => {
    const words = draft
      .split(',')
      .map((w) => w.trim())
      .filter((w) => w && w.length <= 40 && !values.some((v) => v.toLowerCase() === w.toLowerCase()));
    if (words.length) onChange([...values, ...words].slice(0, 30));
    setDraft('');
  };
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <ul className="flex flex-wrap gap-1.5" aria-label={label}>
        {values.map((word) => (
          <li key={word}>
            <Badge variant="outline" className="gap-1 py-1 text-sm" dir="auto">
              {word}
              <button type="button" className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${word}`} onClick={() => onChange(values.filter((v) => v !== word))}>
                <X className="size-3" />
              </button>
            </Badge>
          </li>
        ))}
      </ul>
      <Input
        id={id}
        value={draft}
        dir="auto"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Type a keyword and press Enter"
      />
    </div>
  );
}

function DeleteWorkspace({ name }: { name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  // The active workspace is gone: the dashboard layout picks another membership or onboarding.
  const leave = () => {
    router.push('/app');
    router.refresh();
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await apiFetch<{ confirmationCode: string }>('/api/compliance/delete-workspace', { body: { confirmName: confirm } });
      setCode(result.confirmationCode);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Deletion failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog onOpenChange={(open) => (!open && code ? leave() : undefined)}>
      <DialogTrigger asChild>
        <Button variant="outline" className="border-danger/50 text-danger hover:bg-danger/10">
          Delete workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {code ? (
          <>
            <DialogHeader>
              <DialogTitle>Workspace deleted</DialogTitle>
              <DialogDescription>
                Keep this confirmation code. You can check it at <Link href={`/data-deletion?code=${code}`}>/data-deletion</Link>.
              </DialogDescription>
            </DialogHeader>
            <p className="rounded-xl bg-muted p-3 text-center font-mono text-lg">{code}</p>
            <DialogFooter>
              <Button onClick={leave}>Continue</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently deletes every contact, conversation, message, template, broadcast, chatbot, file and WhatsApp connection in this
                workspace and cancels its card subscription. It can’t be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="confirm-name">
                Type <strong>{name}</strong> to confirm
              </Label>
              <Input id="confirm-name" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </div>
            <DialogFooter>
              <Button variant="destructive" onClick={() => void remove()} loading={busy} disabled={confirm !== name}>
                Delete permanently
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function ComplianceSettingsForm({
  initial,
  optedOutCount,
  workspaceName,
  isOwner,
}: {
  initial: ComplianceSettings;
  optedOutCount: number;
  workspaceName: string;
  isOwner: boolean;
}) {
  const [settings, setSettings] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);
  const [sample, setSample] = React.useState('');
  const set = <K extends keyof ComplianceSettings>(key: K, value: ComplianceSettings[K]) => setSettings((s) => ({ ...s, [key]: value }));
  const match = sample.trim() ? matchOptKeyword(sample, settings) : null;

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = complianceSettingsSchema.safeParse(settings);
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Check the highlighted fields.');
    setSaving(true);
    try {
      const result = await apiFetch<{ compliance: ComplianceSettings }>('/api/workspaces/current/settings', { method: 'PATCH', body: { compliance: parsed.data } });
      setSettings(result.compliance);
      toast.success('Compliance settings saved.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-primary" aria-hidden /> Opt-out keywords
          </CardTitle>
          <CardDescription>
            When a customer’s whole message is one of these words, Talkzi opts them out of marketing messages and replies with your confirmation.{' '}
            <Link className="text-primary underline" href="/app/contacts">
              {optedOutCount.toLocaleString()} contact{optedOutCount === 1 ? '' : 's'} opted out
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={save} className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <KeywordList id="opt-out-keywords" label="Opt-out keywords" values={settings.optOutKeywords} onChange={(v) => set('optOutKeywords', v)} />
              <KeywordList id="opt-in-keywords" label="Opt-in keywords" values={settings.optInKeywords} onChange={(v) => set('optInKeywords', v)} />
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="opt-out-reply">Opt-out confirmation</Label>
                <Textarea id="opt-out-reply" dir="auto" rows={3} maxLength={1024} value={settings.optOutReply} onChange={(e) => set('optOutReply', e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opt-in-reply">Opt-in confirmation</Label>
                <Textarea id="opt-in-reply" dir="auto" rows={3} maxLength={1024} value={settings.optInReply} onChange={(e) => set('optInReply', e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5 rounded-xl border border-border p-3">
              <Label htmlFor="keyword-test">Try a customer message</Label>
              <Input id="keyword-test" dir="auto" value={sample} onChange={(e) => setSample(e.target.value)} placeholder="e.g. Band karo" />
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {!sample.trim()
                  ? 'Matching ignores case and surrounding punctuation, and only whole messages count.'
                  : match
                    ? `${match.action === 'opt_out' ? 'Opts the contact out' : 'Opts the contact back in'} (matches “${match.keyword}”).`
                    : 'No action — this message reaches your inbox and chatbots as usual.'}
              </p>
            </div>

            <div className="max-w-xs space-y-1.5">
              <Label htmlFor="retention">Message retention</Label>
              <Select value={String(settings.dataRetentionDays)} onValueChange={(v) => set('dataRetentionDays', v === 'null' ? null : Number(v))}>
                <SelectTrigger id="retention">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {RETENTION_OPTIONS.map((days) => (
                    <SelectItem key={String(days)} value={String(days)}>
                      {days === null ? 'Keep forever' : days >= 365 ? `${days / 365} year${days === 365 ? '' : 's'}` : `${days} days`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Messages and their media older than this are deleted every night. Contacts are kept.</p>
            </div>

            <Button type="submit" loading={saving}>
              Save compliance settings
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your data</CardTitle>
          <CardDescription>Export everything in this workspace as JSON. To export or erase one customer, open their contact profile.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button variant="outline" asChild>
            <a href="/api/compliance/export" download>
              <Download /> Export workspace data
            </a>
          </Button>
          {isOwner ? (
            <Alert variant="danger" className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4" aria-hidden />
                <AlertDescription>Deleting the workspace removes all of its data for good. Client workspaces of an agency are kept and move to the Free plan.</AlertDescription>
              </div>
              <DeleteWorkspace name={workspaceName} />
            </Alert>
          ) : (
            <p className="text-xs text-muted-foreground">Only the workspace owner can delete the workspace.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
