'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { planHasFeature } from '@talkzi/shared';
import { cn } from '@talkzi/ui/lib/utils';
import { settingsNav } from '@/config/navigation';
import { useApp } from '@/components/providers/app-providers';

export function SettingsNav() {
  const pathname = usePathname();
  const { can, workspace } = useApp();
  return (
    <nav aria-label="Settings" className="-mx-1 overflow-x-auto">
      <ul className="flex min-w-max gap-1 border-b border-border px-1">
        {settingsNav
          .filter((item) => !item.role || can(item.role))
          .filter((item) => !item.feature || planHasFeature(workspace.plan, item.feature))
          .filter((item) => !item.agencyOnly || !workspace.parentWorkspaceId)
          .map((item) => {
            const active = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex border-b-2 px-3 py-2.5 text-sm font-medium transition',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:text-foreground',
                  )}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
      </ul>
    </nav>
  );
}
