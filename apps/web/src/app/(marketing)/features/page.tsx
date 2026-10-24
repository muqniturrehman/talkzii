import type { Metadata } from 'next';
import { CtaBand } from '@/components/marketing/cta-band';
import { FeaturesGrid } from '@/components/marketing/features-grid';
import { HowItWorks } from '@/components/marketing/how-it-works';
import { Reveal } from '@/components/marketing/motion';
import { Section, SectionHeading } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'Features',
  description: 'Shared inbox, broadcasts, chatbots, AI, templates, CRM, analytics and integrations on the WhatsApp Cloud API.',
};

const deepDives = [
  {
    title: 'The 24-hour window, handled',
    body: 'Talkzi tracks the customer service window on every chat. When it closes, the composer switches to approved templates and the API refuses free-form sends — so your team never trips WhatsApp policy by accident.',
  },
  {
    title: 'Quality-aware broadcasting',
    body: 'Broadcasts respect your messaging tier, skip opted-out contacts and pause automatically if your number’s quality rating turns red. Delivery, read and reply stats update live.',
  },
  {
    title: 'Agency-grade multi-tenancy',
    body: 'Every workspace is isolated with Postgres row-level security. Agencies run unlimited client workspaces with their own branding, custom domain and role-based permissions.',
  },
  {
    title: 'Developer friendly',
    body: 'Scoped API keys, HMAC-signed webhooks with automatic retries, and a clean REST API make Talkzi easy to plug into Shopify, WooCommerce, Zapier, n8n or your own backend.',
  },
];

export default function FeaturesPage() {
  return (
    <>
      <Section className="pb-0">
        <SectionHeading
          eyebrow="Features"
          title="Everything your team needs on WhatsApp"
          description="Talkzi brings conversations, campaigns and automation together on Meta’s official Cloud API."
        />
      </Section>
      <FeaturesGrid detailed />
      <Section className="pt-0">
        <div className="grid gap-6 md:grid-cols-2">
          {deepDives.map((item, i) => (
            <Reveal key={item.title} delay={(i % 2) * 0.08}>
              <article className="h-full rounded-2xl border border-border p-8">
                <h3 className="text-xl font-semibold">{item.title}</h3>
                <p className="mt-3 text-muted-foreground">{item.body}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>
      <HowItWorks />
      <CtaBand />
    </>
  );
}
