'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, Plus, Trash2 } from 'lucide-react';
import { API_SCOPE_META, API_SCOPES, type ApiScope } from '@talkzi/shared';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Checkbox } from '@talkzi/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import { CopyField } from './copy-field';

interface ApiKeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiScope[];
  user_id: string | null;
  expires_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

function CreateKeyDialog({ personal }: { personal: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [scopes, setScopes] = React.useState<ApiScope[]>(['messages:write', 'contacts:read']);
  const [expires, setExpires] = React.useState<'never' | '30' | '90' | '365'>('never');
  const [created, setCreated] = React.useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      apiFetch<{ key: string }>('/api/api-keys', {
        body: { name, scopes, personal, expiresInDays: expires === 'never' ? null : Number(expires) },
      }),
    onSuccess: (data) => {
      setCreated(data.key);
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setCreated(null);
          setName('');
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> {personal ? 'New personal token' : 'New API key'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{created ? 'Copy your key now' : personal ? 'New personal token' : 'New API key'}</DialogTitle>
          <DialogDescription>
            {created
              ? 'For your security it won’t be shown again. Store it in your server’s environment, never in browser code.'
              : personal
                ? 'Acts as you: it can only do what your role allows.'
                : 'Workspace keys keep working when team members leave.'}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-4">
            <CopyField value={created} label="API key" secret />
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="key-name">Name</Label>
              <Input id="key-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Shopify server" required />
            </div>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Scopes</legend>
              {API_SCOPES.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={scopes.includes(scope)}
                    onCheckedChange={(v) => setScopes((s) => (v === true ? [...s, scope] : s.filter((x) => x !== scope)))}
                  />
                  <code className="text-xs">{scope}</code>
                  <span className="text-muted-foreground">— {API_SCOPE_META[scope].label}</span>
                </label>
              ))}
            </fieldset>
            <div className="space-y-1.5">
              <Label htmlFor="key-exp">Expires</Label>
              <Select value={expires} onValueChange={(v) => setExpires(v as typeof expires)}>
                <SelectTrigger id="key-exp" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="30">In 30 days</SelectItem>
                  <SelectItem value="90">In 90 days</SelectItem>
                  <SelectItem value="365">In 1 year</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" loading={create.isPending} disabled={!name.trim() || scopes.length === 0}>
                Create
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** API keys list; `personal` shows only the signed-in user's tokens (profile page). */
export function ApiKeysPanel({ personal = false }: { personal?: boolean }) {
  const { user, can } = useApp();
  const qc = useQueryClient();
  const keys = useQuery({ queryKey: ['api-keys'], queryFn: () => apiFetch<ApiKeyRow[]>('/api/api-keys') });
  const revoke = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/api-keys/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Key revoked.');
      void qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = (keys.data ?? []).filter((k) => (personal ? k.user_id === user.id : true));
  const canCreate = personal || can('admin');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Use keys with the <a className="text-primary underline" href="/docs">REST API</a>: <code className="text-xs">Authorization: Bearer tk_live_…</code>
        </p>
        {canCreate ? <CreateKeyDialog personal={personal} /> : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<KeyRound />} title={personal ? 'No personal tokens' : 'No API keys'} description="Keys let your own systems send messages and sync contacts." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((k) => (
            <li key={k.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {k.name} {k.user_id ? <Badge variant="outline">personal</Badge> : null}
                </p>
                <p className="font-mono text-xs text-muted-foreground">{k.prefix}••••••••</p>
                <p className="text-xs text-muted-foreground">
                  {k.scopes.join(', ')} · {k.last_used_at ? `used ${timeAgo(k.last_used_at)}` : 'never used'}
                  {k.expires_at ? ` · expires ${new Date(k.expires_at).toLocaleDateString()}` : ''}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => revoke.mutate(k.id)} disabled={revoke.isPending}>
                <Trash2 /> Revoke
              </Button>
            </li>
          ))}
        </ul>
      )}
      {!personal ? (
        <Alert variant="info">
          <AlertDescription>Keys are stored as SHA-256 hashes. A revoked or expired key stops working immediately.</AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}
