'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, LogIn, Plus } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { initials } from '@talkzi/ui/lib/initials';
import { apiFetch } from '@/lib/api/client';

interface ClientRow {
  id: string;
  name: string;
  logo_url: string | null;
  created_at: string;
  memberCount: number;
  isMember: boolean;
}

const clientsKey = ['client-workspaces'] as const;

async function openWorkspace(id: string, join: boolean) {
  if (join) await apiFetch(`/api/workspaces/clients/${id}/join`, { method: 'POST' });
  await apiFetch('/api/workspaces/switch', { body: { workspaceId: id } });
}

function NewClientDialog() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const create = useMutation({
    mutationFn: () => apiFetch<{ id: string; name: string }>('/api/workspaces/clients', { body: { name } }),
    onSuccess: (client) => {
      toast.success(`${client.name} created.`);
      setOpen(false);
      setName('');
      void qc.invalidateQueries({ queryKey: clientsKey });
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> New client workspace
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New client workspace</DialogTitle>
          <DialogDescription>A separate inbox, contacts and WhatsApp numbers for one client, on your Agency plan and branding.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="client-name">Client name</Label>
            <Input id="client-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="Bano Bazaar" required />
          </div>
          <DialogFooter>
            <Button type="submit" loading={create.isPending} disabled={name.trim().length < 2}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ClientWorkspaces() {
  const router = useRouter();
  const clients = useQuery({ queryKey: clientsKey, queryFn: () => apiFetch<ClientRow[]>('/api/workspaces/clients') });
  const open = useMutation({
    mutationFn: (client: ClientRow) => openWorkspace(client.id, !client.isMember),
    onSuccess: () => {
      router.push('/app');
      router.refresh();
    },
    onError: (error) => toast.error(error.message),
  });
  const rows = clients.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Each client gets its own inbox, contacts, numbers and team. They’re billed through this workspace.</p>
        <NewClientDialog />
      </div>
      {clients.isLoading ? (
        <Skeleton className="h-24 rounded-2xl" />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Building2 />} title="No client workspaces yet" description="Create one per brand you manage — switch between them from the sidebar." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {rows.map((client) => (
            <li key={client.id} className="flex flex-wrap items-center gap-3 p-3">
              <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-primary/10 text-xs font-bold text-primary dark:text-accent">
                {client.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={client.logo_url} alt="" className="size-full object-cover" />
                ) : (
                  initials(client.name)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {client.memberCount} member{client.memberCount === 1 ? '' : 's'} · created {new Date(client.created_at).toLocaleDateString()}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => open.mutate(client)} loading={open.isPending && open.variables?.id === client.id}>
                <LogIn /> {client.isMember ? 'Open' : 'Join & open'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
