'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@talkzi/ui/dropdown-menu';
import { toast } from '@talkzi/ui/sonner';
import { initials } from '@talkzi/ui/lib/initials';
import { ROLE_META } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';
import { useApp } from '@/components/providers/app-providers';

export function WorkspaceSwitcher() {
  const router = useRouter();
  const { workspace, memberships } = useApp();
  const [pending, setPending] = React.useState(false);

  async function switchTo(id: string) {
    if (id === workspace.id) return;
    setPending(true);
    try {
      await apiFetch('/api/workspaces/switch', { body: { workspaceId: id } });
      router.push('/app');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not switch workspace.');
    } finally {
      setPending(false);
    }
  }

  const brandName = workspace.branding.brandName ?? workspace.name;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-xl border border-border bg-background/40 p-2 text-left transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:opacity-60"
        disabled={pending}
        aria-label="Switch workspace"
      >
        <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-gradient text-xs font-bold text-white">
          {workspace.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={workspace.logoUrl} alt="" className="size-full object-cover" />
          ) : (
            initials(workspace.name)
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{brandName}</span>
          <span className="block truncate text-xs text-muted-foreground capitalize">
            {workspace.plan} · {ROLE_META[workspace.role].label}
          </span>
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        {memberships.map((m) => (
          <DropdownMenuItem key={m.id} onSelect={() => void switchTo(m.id)}>
            <span className="flex size-6 items-center justify-center rounded-md bg-primary/15 text-[10px] font-bold text-primary dark:text-accent">
              {initials(m.name)}
            </span>
            <span className="flex-1 truncate">{m.name}</span>
            {m.id === workspace.id ? <Check className="text-primary" /> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/onboarding')}>
          <Plus /> Create workspace
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
