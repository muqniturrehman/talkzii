'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, MessageCircle, Plus, Trash2, X } from 'lucide-react';
import { formatPhone } from '@talkzi/shared';
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
import { Badge } from '@talkzi/ui/badge';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@talkzi/ui/command';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@talkzi/ui/popover';
import { Skeleton } from '@talkzi/ui/skeleton';
import { Switch } from '@talkzi/ui/switch';
import { Textarea } from '@talkzi/ui/textarea';
import { toast } from '@talkzi/ui/sonner';
import { useApp } from '@/components/providers/app-providers';
import { useLabels } from '@/components/app/inbox/use-inbox';
import { apiFetch } from '@/lib/api/client';
import type { ContactDetail } from '@/lib/contacts/types';
import { timeAgo } from '@/lib/format';
import type { LabelItem, NoteItem } from '@/lib/inbox/types';
import { contactsKey } from './contacts-table';

const detailKey = (id: string) => ['contacts', 'detail', id] as const;
const notesKey = (id: string) => ['contacts', 'notes', id] as const;

function DetailsForm({ contact, canEdit }: { contact: ContactDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const [values, setValues] = React.useState({ name: contact.name ?? '', email: contact.email ?? '', locale: contact.locale ?? '' });
  const dirty = values.name !== (contact.name ?? '') || values.email !== (contact.email ?? '') || values.locale !== (contact.locale ?? '');
  const save = useMutation({
    mutationFn: () => apiFetch<ContactDetail>(`/api/contacts/${contact.id}`, { method: 'PATCH', body: values }),
    onSuccess: (updated) => {
      qc.setQueryData(detailKey(contact.id), updated);
      void qc.invalidateQueries({ queryKey: contactsKey });
      toast.success('Contact saved.');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="c-name">Name</Label>
          <Input id="c-name" value={values.name} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-email">Email</Label>
          <Input id="c-email" type="email" value={values.email} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="c-locale">Language</Label>
          <Input id="c-locale" placeholder="en, ur…" value={values.locale} disabled={!canEdit} onChange={(e) => setValues((v) => ({ ...v, locale: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <Label>WhatsApp profile name</Label>
          <Input value={contact.profile_name ?? '—'} disabled readOnly />
        </div>
      </div>
      {canEdit ? (
        <Button type="submit" disabled={!dirty} loading={save.isPending}>
          Save changes
        </Button>
      ) : null}
    </form>
  );
}

function CustomFields({ contact, canEdit }: { contact: ContactDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const initial = Object.entries((contact.custom_fields ?? {}) as Record<string, unknown>).map(([key, value]) => ({ key, value: value == null ? '' : String(value) }));
  const [fields, setFields] = React.useState(initial);
  const save = useMutation({
    mutationFn: () =>
      apiFetch<ContactDetail>(`/api/contacts/${contact.id}`, {
        method: 'PATCH',
        body: { customFields: Object.fromEntries(fields.filter((f) => f.key.trim()).map((f) => [f.key.trim(), f.value])) },
      }),
    onSuccess: (updated) => {
      qc.setQueryData(detailKey(contact.id), updated);
      toast.success('Custom fields saved.');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-3">
      {fields.length === 0 ? <p className="text-sm text-muted-foreground">No custom fields yet.</p> : null}
      {fields.map((field, i) => (
        <div key={i} className="flex gap-2">
          <Input
            aria-label="Field name"
            placeholder="Field"
            value={field.key}
            disabled={!canEdit}
            maxLength={50}
            onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
            className="w-40"
          />
          <Input
            aria-label="Field value"
            placeholder="Value"
            value={field.value}
            disabled={!canEdit}
            maxLength={1000}
            onChange={(e) => setFields((f) => f.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
          />
          {canEdit ? (
            <Button size="icon" variant="ghost" aria-label="Remove field" onClick={() => setFields((f) => f.filter((_, j) => j !== i))}>
              <X />
            </Button>
          ) : null}
        </div>
      ))}
      {canEdit ? (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setFields((f) => [...f, { key: '', value: '' }])} disabled={fields.length >= 50}>
            <Plus /> Add field
          </Button>
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending}>
            Save fields
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function ContactLabels({ contact, canEdit }: { contact: ContactDetail; canEdit: boolean }) {
  const qc = useQueryClient();
  const labels = useLabels();
  const onSuccess = (next: LabelItem[]) => {
    qc.setQueryData<ContactDetail>(detailKey(contact.id), (old) => (old ? { ...old, labels: next } : old));
    void qc.invalidateQueries({ queryKey: contactsKey });
  };
  const add = useMutation({ mutationFn: (labelId: string) => apiFetch<LabelItem[]>(`/api/contacts/${contact.id}/labels`, { body: { labelId } }), onSuccess });
  const remove = useMutation({
    mutationFn: (labelId: string) => apiFetch<LabelItem[]>(`/api/contacts/${contact.id}/labels?labelId=${labelId}`, { method: 'DELETE' }),
    onSuccess,
  });
  const active = new Set(contact.labels.map((l) => l.id));

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {contact.labels.map((label) => (
        <span key={label.id} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs">
          <span className="size-2 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
          {label.name}
          {canEdit ? (
            <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={() => remove.mutate(label.id)} aria-label={`Remove ${label.name}`}>
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {canEdit ? (
        <Popover>
          <PopoverTrigger asChild>
            <Button size="sm" variant="ghost">
              <Plus /> Label
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-60 p-0" align="start">
            <Command>
              <CommandInput placeholder="Find a label…" />
              <CommandList>
                <CommandEmpty>No labels found.</CommandEmpty>
                <CommandGroup>
                  {(labels.data ?? []).map((label) => (
                    <CommandItem key={label.id} value={label.name} onSelect={() => (active.has(label.id) ? remove.mutate(label.id) : add.mutate(label.id))}>
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: label.color }} aria-hidden />
                      <span className="flex-1">{label.name}</span>
                      {active.has(label.id) ? <Check className="size-4 text-primary" /> : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      ) : null}
    </div>
  );
}

function Notes({ contactId, canEdit }: { contactId: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const notes = useQuery({ queryKey: notesKey(contactId), queryFn: () => apiFetch<NoteItem[]>(`/api/contacts/${contactId}/notes`) });
  const [body, setBody] = React.useState('');
  const add = useMutation({
    mutationFn: () => apiFetch<NoteItem>(`/api/contacts/${contactId}/notes`, { body: { body } }),
    onSuccess: (note) => {
      qc.setQueryData<NoteItem[]>(notesKey(contactId), (old) => [note, ...(old ?? [])]);
      setBody('');
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <div className="space-y-3">
      {canEdit ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (body.trim()) add.mutate();
          }}
        >
          <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Add a note for your team…" aria-label="New note" />
          <Button size="sm" type="submit" loading={add.isPending} disabled={!body.trim()}>
            Add note
          </Button>
        </form>
      ) : null}
      {notes.isPending ? <Skeleton className="h-16 w-full" /> : null}
      <ul className="space-y-2">
        {(notes.data ?? []).map((note) => (
          <li key={note.id} className="rounded-xl border border-warning/30 bg-warning/5 p-3 text-sm">
            <p className="whitespace-pre-wrap">{note.body}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {note.author?.full_name ?? note.author?.email ?? 'Teammate'} · {timeAgo(note.created_at)}
              {note.conversation_id ? ' · from a conversation' : ''}
            </p>
          </li>
        ))}
      </ul>
      {notes.data && notes.data.length === 0 ? <p className="text-sm text-muted-foreground">No notes yet.</p> : null}
    </div>
  );
}

export function ContactProfile({ id }: { id: string }) {
  const { can } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const canEdit = can('agent');
  const contact = useQuery({ queryKey: detailKey(id), queryFn: () => apiFetch<ContactDetail>(`/api/contacts/${id}`) });

  const openConversation = useMutation({
    mutationFn: () => apiFetch<{ conversationId: string }>(`/api/contacts/${id}/conversation`, { body: {} }),
    onSuccess: ({ conversationId }) => router.push(`/app/inbox?c=${conversationId}`),
    onError: (error) => toast.error(error.message),
  });
  const optOut = useMutation({
    mutationFn: (optedOut: boolean) => apiFetch<ContactDetail>(`/api/contacts/${id}`, { method: 'PATCH', body: { optedOut } }),
    onSuccess: (updated) => {
      qc.setQueryData(detailKey(id), updated);
      void qc.invalidateQueries({ queryKey: contactsKey });
      toast.success(updated.opted_out ? 'Contact opted out of marketing messages.' : 'Contact re-subscribed.');
    },
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: () => apiFetch(`/api/contacts/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: contactsKey });
      toast.success('Contact deleted.');
      router.push('/app/contacts');
    },
    onError: (error) => toast.error(error.message),
  });

  if (contact.isPending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6 lg:p-8">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (contact.isError || !contact.data) {
    return (
      <div className="mx-auto max-w-5xl p-8 text-center text-sm text-muted-foreground">
        Contact not found. <Link href="/app/contacts" className="text-primary underline">Back to contacts</Link>
      </div>
    );
  }

  const c = contact.data;
  const name = c.name ?? c.profile_name ?? formatPhone(c.wa_id);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <Link href="/app/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contacts
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar name={name} src={c.avatar_url} className="size-16 text-lg" />
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">
              {formatPhone(c.wa_id)} · {c.source} · added {timeAgo(c.created_at)}
            </p>
            <div className="mt-1 flex gap-1.5">
              {c.opted_out ? <Badge variant="danger">Opted out</Badge> : <Badge variant="success">Subscribed</Badge>}
              <Badge variant="outline">{c.stats.inbound} received</Badge>
              <Badge variant="outline">{c.stats.outbound} sent</Badge>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          {canEdit ? (
            <Button onClick={() => openConversation.mutate()} loading={openConversation.isPending}>
              <MessageCircle /> Message
            </Button>
          ) : null}
          {can('admin') ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" aria-label="Delete contact">
                  <Trash2 />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {name}?</AlertDialogTitle>
                  <AlertDialogDescription>Conversations, messages and notes with this contact are deleted too.</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction destructive onClick={() => remove.mutate()}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <DetailsForm key={c.updated_at} contact={c} canEdit={canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Custom fields</CardTitle>
              <CardDescription>Use them in broadcasts and chatbot messages, e.g. city or customer tier.</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomFields key={c.updated_at} contact={c} canEdit={canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <Notes contactId={c.id} canEdit={canEdit} />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Labels</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactLabels contact={c} canEdit={canEdit} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Marketing consent</CardTitle>
              <CardDescription>Opted-out contacts are skipped by broadcasts. Replies and utility messages still work.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="opted-out">Opted out</Label>
                <Switch id="opted-out" checked={c.opted_out} disabled={!canEdit || optOut.isPending} onCheckedChange={(v) => optOut.mutate(v)} />
              </div>
              {c.opted_out && c.opted_out_at ? (
                <p className="text-xs text-muted-foreground">
                  {c.opt_out_reason ?? 'Opted out'} · {timeAgo(c.opted_out_at)}
                </p>
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
            </CardHeader>
            <CardContent>
              {c.conversations.length === 0 ? (
                <p className="text-sm text-muted-foreground">No conversations yet.</p>
              ) : (
                <ul className="space-y-2">
                  {c.conversations.map((conv) => (
                    <li key={conv.id}>
                      <Link href={`/app/inbox?c=${conv.id}`} className="block rounded-xl border border-border p-3 text-sm hover:border-primary/50">
                        <span className="flex items-center justify-between gap-2">
                          <Badge variant={conv.status === 'resolved' ? 'secondary' : 'info'}>{conv.status}</Badge>
                          <span className="text-xs text-muted-foreground">{timeAgo(conv.last_message_at)}</span>
                        </span>
                        <span className="mt-1 line-clamp-2 block text-muted-foreground">{conv.last_message_preview ?? 'No messages yet'}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
