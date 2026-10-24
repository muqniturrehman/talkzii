'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@talkzi/ui/command';
import { Kbd } from '@talkzi/ui/kbd';
import { primaryNav, workspaceNav } from '@/config/navigation';
import { useApp } from '@/components/providers/app-providers';

const actions = [
  { label: 'New broadcast', href: '/app/broadcasts/new', role: 'admin' as const },
  { label: 'New template', href: '/app/templates/new', role: 'admin' as const },
  { label: 'Import contacts', href: '/app/contacts?import=1', role: 'agent' as const },
  { label: 'Invite teammate', href: '/app/team?invite=1', role: 'admin' as const },
  { label: 'Connect WhatsApp number', href: '/app/sessions/connect', role: 'admin' as const },
];

export function CommandPalette() {
  const router = useRouter();
  const { can } = useApp();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="hidden h-9 w-64 items-center gap-2 rounded-xl border border-border bg-background/40 px-3 text-sm text-muted-foreground transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none md:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search or jump to…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen} title="Search Talkzi">
        <CommandInput placeholder="Type a page or action…" />
        <CommandList>
          <CommandEmpty>No results.</CommandEmpty>
          <CommandGroup heading="Go to">
            {[...primaryNav, ...workspaceNav]
              .filter((item) => !item.role || can(item.role))
              .map((item) => (
                <CommandItem key={item.href} value={item.label} onSelect={() => go(item.href)}>
                  <item.icon /> {item.label}
                </CommandItem>
              ))}
          </CommandGroup>
          <CommandSeparator />
          <CommandGroup heading="Actions">
            {actions
              .filter((a) => can(a.role))
              .map((a) => (
                <CommandItem key={a.href} value={a.label} onSelect={() => go(a.href)}>
                  <Plus /> {a.label}
                </CommandItem>
              ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
