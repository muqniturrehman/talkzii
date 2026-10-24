'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, Tags, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { toast } from '@talkzi/ui/sonner';
import { useApp } from '@/components/providers/app-providers';
import { labelsKey, useLabels } from '@/components/app/inbox/use-inbox';
import { apiFetch, ApiClientError } from '@/lib/api/client';
import { contactsKey } from './contacts-table';

const LABEL_COLORS = ['#8B5CF6', '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#14B8A6', '#64748B'];

export function AddContactDialog() {
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState({ phone: '', name: '', email: '' });
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  const create = useMutation({
    mutationFn: () => apiFetch<{ id: string }>('/api/contacts', { body: values }),
    onSuccess: (contact) => {
      toast.success('Contact added.');
      setOpen(false);
      setValues({ phone: '', name: '', email: '' });
      void qc.invalidateQueries({ queryKey: contactsKey });
      router.push(`/app/contacts/${contact.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiClientError) {
        setErrors(error.fieldErrors);
        const existing = (error.details as { id?: string } | undefined)?.id;
        if (existing) {
          toast.error(error.message, { action: { label: 'Open', onClick: () => router.push(`/app/contacts/${existing}`) } });
          return;
        }
      }
      toast.error(error instanceof Error ? error.message : 'Could not add the contact');
    },
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Add contact
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add contact</DialogTitle>
          <DialogDescription>Local numbers like 0300 1234567 use your workspace’s default country code.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setErrors({});
            create.mutate();
          }}
        >
          {(['phone', 'name', 'email'] as const).map((field) => (
            <div key={field} className="space-y-1.5">
              <Label htmlFor={`contact-${field}`}>{field === 'phone' ? 'WhatsApp number' : field === 'name' ? 'Name' : 'Email (optional)'}</Label>
              <Input
                id={`contact-${field}`}
                type={field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'}
                inputMode={field === 'phone' ? 'tel' : undefined}
                placeholder={field === 'phone' ? '+92 300 1234567' : undefined}
                required={field === 'phone'}
                value={values[field]}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                aria-invalid={Boolean(errors[field])}
              />
              {errors[field] ? <p className="text-xs text-danger">{errors[field][0]}</p> : null}
            </div>
          ))}
          <DialogFooter>
            <Button type="submit" loading={create.isPending}>
              Add contact
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LabelsDialog() {
  const { can } = useApp();
  const qc = useQueryClient();
  const labels = useLabels();
  const [name, setName] = React.useState('');
  const [color, setColor] = React.useState(LABEL_COLORS[0]!);
  const [editing, setEditing] = React.useState<{ id: string; name: string } | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: labelsKey });
    void qc.invalidateQueries({ queryKey: contactsKey });
  };
  const onError = (error: Error) => toast.error(error.message);
  const create = useMutation({
    mutationFn: () => apiFetch('/api/labels', { body: { name, color } }),
    onSuccess: () => {
      setName('');
      refresh();
    },
    onError,
  });
  const rename = useMutation({
    mutationFn: (label: { id: string; name: string }) => apiFetch(`/api/labels/${label.id}`, { method: 'PATCH', body: { name: label.name } }),
    onSuccess: () => {
      setEditing(null);
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/labels/${id}`, { method: 'DELETE' }),
    onSuccess: refresh,
    onError,
  });

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Tags /> Labels
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Labels</DialogTitle>
          <DialogDescription>Organise contacts and conversations, and target broadcasts by label.</DialogDescription>
        </DialogHeader>
        {can('agent') ? (
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="label-name">New label</Label>
              <Input id="label-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wholesale" />
            </div>
            <div className="flex gap-1 pb-2" role="radiogroup" aria-label="Label colour">
              {LABEL_COLORS.slice(0, 5).map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={color === c}
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className="size-5 rounded-full ring-offset-2 ring-offset-background aria-checked:ring-2 aria-checked:ring-ring"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <Button type="submit" size="icon" aria-label="Create label" loading={create.isPending} disabled={!name.trim()}>
              <Plus />
            </Button>
          </form>
        ) : null}
        <ul className="max-h-80 divide-y divide-border overflow-y-auto rounded-xl border border-border scrollbar-thin">
          {(labels.data ?? []).length === 0 ? <li className="p-4 text-center text-sm text-muted-foreground">No labels yet.</li> : null}
          {(labels.data ?? []).map((label) => (
            <li key={label.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
              {editing?.id === label.id ? (
                <form
                  className="flex flex-1 gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    rename.mutate(editing);
                  }}
                >
                  <Input autoFocus value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" />
                  <Button size="sm" type="submit" loading={rename.isPending}>
                    Save
                  </Button>
                </form>
              ) : (
                <span className="flex-1 truncate">{label.name}</span>
              )}
              {can('admin') && editing?.id !== label.id ? (
                <>
                  <Button size="icon-sm" variant="ghost" aria-label={`Rename ${label.name}`} onClick={() => setEditing({ id: label.id, name: label.name })}>
                    <Pencil />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label={`Delete ${label.name}`} onClick={() => remove.mutate(label.id)}>
                    <Trash2 />
                  </Button>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
