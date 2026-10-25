import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { audit } from '@/lib/audit';
import { attachDomainToHost, checkDomainDns, domainStatus, domainVerificationToken } from '@/lib/custom-domain';

/**
 * Checks the TXT ownership record (and reports the CNAME). The first
 * successful check marks the domain verified and attaches it to the host.
 */
export const POST = createHandler({ role: 'admin', feature: 'custom_domain', rateLimit: { prefix: 'domain-verify', limit: 10, windowSeconds: 60 } }, async ({ admin, workspace, user, req }) => {
  const db = admin();
  const { data } = await db.from('workspaces').select('custom_domain, custom_domain_verified_at').eq('id', workspace.id).single();
  if (!data?.custom_domain) throw ApiError.conflict('Add a domain first.');

  const dns = await checkDomainDns(data.custom_domain, domainVerificationToken(workspace.id, data.custom_domain));
  let verifiedAt = data.custom_domain_verified_at;
  let hosting: { attached: boolean; message: string } | null = null;
  if (dns.txtVerified && !verifiedAt) {
    verifiedAt = new Date().toISOString();
    await db.from('workspaces').update({ custom_domain_verified_at: verifiedAt }).eq('id', workspace.id);
    hosting = await attachDomainToHost(data.custom_domain);
    await audit({ workspaceId: workspace.id, actorId: user.id, action: 'workspace.domain_verified', metadata: { domain: data.custom_domain, attached: hosting.attached }, req });
  }
  return { ...domainStatus(workspace.id, data.custom_domain, verifiedAt), dns, hosting };
});
