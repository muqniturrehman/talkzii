import type { Metadata } from 'next';
import { KeyRound, Lock, Network, ScrollText, ServerCog, ShieldCheck, Users, Webhook } from 'lucide-react';
import { Reveal } from '@/components/marketing/motion';
import { Section, SectionHeading } from '@/components/marketing/section';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Security',
  description: 'How Talkzi protects your data: encryption, tenant isolation, signed webhooks, audit logs and responsible disclosure.',
};

const controls = [
  {
    icon: Lock,
    title: 'Encryption everywhere',
    body: 'TLS 1.2+ in transit and AES-256 encryption at rest. WhatsApp access tokens are additionally encrypted with AES-256-GCM using keys held only by the application.',
  },
  {
    icon: Users,
    title: 'Tenant isolation',
    body: 'Every row is scoped to a workspace and protected by Postgres row-level security, verified against live membership on every query.',
  },
  {
    icon: KeyRound,
    title: 'Least-privilege access',
    body: 'Owner, admin, agent and viewer roles are enforced in the application and the database. API keys are scoped and stored as SHA-256 hashes.',
  },
  {
    icon: ShieldCheck,
    title: 'Verified webhooks',
    body: 'Inbound Meta webhooks are verified with X-Hub-Signature-256. Every raw payload is logged for replay, and processing is idempotent.',
  },
  {
    icon: Webhook,
    title: 'Signed outbound events',
    body: 'Webhooks we send are HMAC-SHA256 signed with a per-endpoint secret and timestamp to prevent tampering and replay attacks.',
  },
  {
    icon: ScrollText,
    title: 'Audit logging',
    body: 'Sensitive actions — connecting numbers, changing roles, creating API keys, exporting data — are recorded in a tamper-evident audit log.',
  },
  {
    icon: Network,
    title: 'Abuse protection',
    body: 'Rate limiting on authentication and public APIs, opt-out enforcement, and automatic broadcast pausing when number quality drops.',
  },
  {
    icon: ServerCog,
    title: 'Resilient infrastructure',
    body: 'Hosted on Vercel and Supabase with automated backups. Serverless functions scale with load; queues retry failed work safely.',
  },
];

export default function SecurityPage() {
  return (
    <>
      <Section>
        <SectionHeading
          eyebrow="Security"
          title="Your conversations are your business"
          description="Talkzi is designed with security and privacy at every layer — from WhatsApp tokens to database rows."
        />
        <div className="grid gap-4 sm:grid-cols-2">
          {controls.map((control, i) => (
            <Reveal key={control.title} delay={(i % 2) * 0.06}>
              <article className="glass flex h-full gap-4 rounded-2xl p-6">
                <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary dark:text-accent">
                  <control.icon className="size-5" aria-hidden />
                </div>
                <div>
                  <h2 className="font-semibold">{control.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{control.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>
      <Section className="pt-0">
        <div className="mx-auto max-w-3xl rounded-2xl border border-border p-8">
          <h2 className="text-xl font-semibold">Responsible disclosure</h2>
          <p className="mt-3 text-muted-foreground">
            Found a vulnerability? Email{' '}
            <a className="text-primary underline-offset-4 hover:underline" href={`mailto:${siteConfig.emails.security}`}>
              {siteConfig.emails.security}
            </a>{' '}
            with details and steps to reproduce. We acknowledge reports within 3 business days and will not pursue
            legal action against good-faith research that avoids privacy violations and service disruption.
          </p>
        </div>
      </Section>
    </>
  );
}
