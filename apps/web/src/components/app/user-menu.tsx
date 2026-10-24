'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from '@talkzi/ui/theme-provider';
import { LogOut, Moon, Sun, UserRound } from 'lucide-react';
import { UserAvatar } from '@talkzi/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@talkzi/ui/dropdown-menu';
import { apiFetch } from '@/lib/api/client';
import { useApp } from '@/components/providers/app-providers';

export function UserMenu() {
  const router = useRouter();
  const { user } = useApp();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  async function signOut() {
    await apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    router.replace('/login');
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-primary/10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label="Account menu"
      >
        <UserAvatar name={user.fullName ?? user.email} src={user.avatarUrl} className="size-8" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{user.fullName ?? 'Your account'}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">
        <DropdownMenuLabel className="truncate">{user.email}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/app/settings/profile')}>
          <UserRound /> Profile & security
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setTheme(isDark ? 'light' : 'dark')}>
          {isDark ? <Sun /> : <Moon />} {isDark ? 'Light mode' : 'Dark mode'}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive onSelect={() => void signOut()}>
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
