import 'server-only';
import { cache } from 'react';
import { parseBranding, planHasFeature, type Branding, type PlanId } from '@talkzi/shared';
import type { Json } from '@talkzi/db';
import { isSupabaseConfigured } from '@/lib/public-env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { isCustomDomainHost, normalizeHost } from './hosts';

interface BrandedWorkspace {
  plan: PlanId;
  branding: Json;
  parent_workspace_id: string | null;
}

/**
 * Branding actually applied to a workspace: its own (white-label plans), with
 * client workspaces inheriting their agency's branding field by field.
 */
export async function effectiveBranding(admin: TypedSupabaseClient, workspace: BrandedWorkspace): Promise<Branding> {
  const own = planHasFeature(workspace.plan, 'white_label') ? parseBranding(workspace.branding) : {};
  if (!workspace.parent_workspace_id) return own;
  const { data: agency } = await admin.from('workspaces').select('plan, branding').eq('id', workspace.parent_workspace_id).maybeSingle();
  if (!agency || !planHasFeature(agency.plan, 'white_label')) return own;
  return { ...parseBranding(agency.branding), ...own };
}

/** Request-scoped effective branding for a workspace (layout + metadata share one lookup). */
export const workspaceBranding = cache(async (workspaceId: string): Promise<Branding> => {
  if (!isSupabaseConfigured()) return {};
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from('workspaces').select('plan, branding, parent_workspace_id').eq('id', workspaceId).maybeSingle();
  return data ? effectiveBranding(admin, data) : {};
});

/** Brand for a request arriving on an agency's verified custom domain (login pages). */
export async function brandingForHost(host: string | null): Promise<{ workspaceName: string; branding: Branding } | null> {
  const domain = normalizeHost(host);
  if (!domain || !isCustomDomainHost(domain) || !isSupabaseConfigured()) return null;
  const admin = createSupabaseAdminClient();
  const { data } = await admin
    .from('workspaces')
    .select('name, plan, branding, parent_workspace_id')
    .eq('custom_domain', domain)
    .not('custom_domain_verified_at', 'is', null)
    .maybeSingle();
  if (!data || !planHasFeature(data.plan, 'custom_domain')) return null;
  return { workspaceName: data.name, branding: await effectiveBranding(admin, data) };
}
