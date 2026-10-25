'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Logo } from '@talkzi/ui/logo';
import { cn } from '@talkzi/ui/lib/utils';
import { isActive, primaryNav, workspaceNav, type NavItem } from '@/config/navigation';
import { useApp } from '@/components/providers/app-providers';
import { UserMenu } from './user-menu';
import { WorkspaceSwitcher } from './workspace-switcher';

function NavList({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { can } = useApp();
  return (
    <ul className="space-y-0.5">
      {items
        .filter((item) => !item.role || can(item.role))
        .map((item) => {
          const active = isActive(pathname, item);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'group flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition',
                  active
                    ? 'bg-primary/15 text-foreground'
                    : 'text-muted-foreground hover:bg-primary/10 hover:text-foreground',
                )}
              >
                <item.icon
                  className={cn('size-4 shrink-0', active ? 'text-primary dark:text-accent' : 'group-hover:text-foreground')}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
    </ul>
  );
}

export function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { workspace } = useApp();
  return (
    <div className="flex h-full flex-col gap-4 p-3">
      <div className="px-2 pt-1">
        <Logo name={workspace.branding.brandName ?? 'Talkzi'} logoUrl={workspace.branding.logoUrl} />
      </div>
      <WorkspaceSwitcher />
      <nav aria-label="Primary" className="flex-1 space-y-6 overflow-y-auto scrollbar-thin">
        <NavList items={primaryNav} onNavigate={onNavigate} />
        <div>
          <p className="px-3 pb-2 text-[11px] font-semibold tracking-wider text-muted-foreground/80 uppercase">Workspace</p>
          <NavList items={workspaceNav} onNavigate={onNavigate} />
        </div>
      </nav>
      <UserMenu />
      {workspace.branding.brandName && !workspace.branding.hidePoweredBy ? (
        <p className="px-3 text-center text-[11px] text-muted-foreground/80">Powered by Talkzi</p>
      ) : null}
    </div>
  );
}

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 border-r border-border bg-surface/60 backdrop-blur-md lg:block">
      <SidebarContent />
    </aside>
  );
}
