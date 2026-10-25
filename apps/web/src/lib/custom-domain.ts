import 'server-only';
import { promises as dns } from 'node:dns';
import { configured, env } from '@/lib/env';
import { getEncryptionKey, hmacSha256 } from '@/lib/crypto';

export const verificationRecordName = (domain: string) => `_talkzi.${domain}`;
export const cnameTarget = () => (env().CUSTOM_DOMAIN_CNAME_TARGET ?? 'cname.vercel-dns.com').replace(/\.$/, '').toLowerCase();

/** Deterministic TXT value proving the workspace controls the domain. */
export function domainVerificationToken(workspaceId: string, domain: string): string {
  return `talkzi-verify=${hmacSha256(getEncryptionKey().toString('hex'), `${workspaceId}:${domain}`).slice(0, 32)}`;
}

export interface DomainStatus {
  domain: string | null;
  verifiedAt: string | null;
  records: { type: 'CNAME' | 'TXT'; name: string; value: string }[];
}

/** The DNS records a client adds: CNAME for traffic, TXT for proof of ownership. */
export function domainStatus(workspaceId: string, domain: string | null, verifiedAt: string | null): DomainStatus {
  return {
    domain,
    verifiedAt,
    records: domain
      ? [
          { type: 'CNAME', name: domain, value: cnameTarget() },
          { type: 'TXT', name: verificationRecordName(domain), value: domainVerificationToken(workspaceId, domain) },
        ]
      : [],
  };
}

export interface DnsCheck {
  txtVerified: boolean;
  cname: string | null;
  pointsToTalkzi: boolean;
}

type Resolver = Pick<typeof dns, 'resolveTxt' | 'resolveCname'>;

export async function checkDomainDns(domain: string, token: string, resolver: Resolver = dns): Promise<DnsCheck> {
  const [txtVerified, cname] = await Promise.all([
    resolver
      .resolveTxt(verificationRecordName(domain))
      .then((records) => records.some((chunks) => chunks.join('') === token))
      .catch(() => false),
    resolver
      .resolveCname(domain)
      .then((records) => records[0]?.replace(/\.$/, '').toLowerCase() ?? null)
      .catch(() => null),
  ]);
  return { txtVerified, cname, pointsToTalkzi: cname === cnameTarget() };
}

/**
 * Adds a verified domain to the Vercel project when VERCEL_API_TOKEN and
 * VERCEL_PROJECT_ID are set; otherwise a stub that tells the operator what to
 * do (SSL is issued by Vercel once the domain is attached and the CNAME resolves).
 */
export async function attachDomainToHost(domain: string, fetchImpl: typeof fetch = fetch): Promise<{ attached: boolean; message: string }> {
  if (!configured.vercelDomains()) {
    return { attached: false, message: 'Automatic attach is off — add the domain in Vercel → Project → Settings → Domains.' };
  }
  const e = env();
  const team = e.VERCEL_TEAM_ID ? `?teamId=${encodeURIComponent(e.VERCEL_TEAM_ID)}` : '';
  try {
    const res = await fetchImpl(`https://api.vercel.com/v10/projects/${encodeURIComponent(e.VERCEL_PROJECT_ID!)}/domains${team}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${e.VERCEL_API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ name: domain }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { attached: true, message: 'Domain added to the hosting project.' };
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    return { attached: false, message: body.error?.message ?? `The hosting API returned ${res.status}.` };
  } catch {
    return { attached: false, message: 'The hosting API could not be reached; add the domain manually.' };
  }
}
