import {
  BarChart3,
  Bot,
  FileText,
  LayoutDashboard,
  Megaphone,
  MessagesSquare,
  Plug,
  Settings,
  Smartphone,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react';
import type { WorkspaceRole } from '@talkzi/shared';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Minimum role to see the item. */
  role?: WorkspaceRole;
  /** Exact match for active state (Overview). */
  exact?: boolean;
  /** Prefix used for the active state when it differs from href. */
  match?: string;
}

export const primaryNav: NavItem[] = [
  { href: '/app', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/app/inbox', label: 'Inbox', icon: MessagesSquare },
  { href: '/app/contacts', label: 'Contacts', icon: Users },
  { href: '/app/broadcasts', label: 'Broadcasts', icon: Megaphone },
  { href: '/app/templates', label: 'Templates', icon: FileText },
  { href: '/app/chatbots', label: 'Chatbots', icon: Bot },
  { href: '/app/analytics', label: 'Analytics', icon: BarChart3 },
];

export const workspaceNav: NavItem[] = [
  { href: '/app/sessions', label: 'WhatsApp numbers', icon: Smartphone, role: 'admin' },
  { href: '/app/integrations', label: 'Integrations', icon: Plug, role: 'admin' },
  { href: '/app/team', label: 'Team', icon: UserPlus },
  { href: '/app/settings/profile', label: 'Settings', icon: Settings, match: '/app/settings' },
];

export const settingsNav: { href: string; label: string; role?: WorkspaceRole }[] = [
  { href: '/app/settings/profile', label: 'Profile' },
  { href: '/app/settings/general', label: 'General', role: 'admin' },
  { href: '/app/settings/branding', label: 'Branding', role: 'admin' },
  { href: '/app/settings/billing', label: 'Billing', role: 'admin' },
  { href: '/app/settings/compliance', label: 'Compliance', role: 'admin' },
];

export function isActive(pathname: string, item: Pick<NavItem, 'href' | 'exact' | 'match'>): boolean {
  if (item.exact) return pathname === item.href;
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}
