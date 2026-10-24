import type { Metadata } from 'next';
import { Check, Minus } from 'lucide-react';
import { CtaBand } from '@/components/marketing/cta-band';
import { Faq } from '@/components/marketing/faq';
import { PricingSection } from '@/components/marketing/pricing-section';
import { Section, SectionHeading } from '@/components/marketing/section';
import { PLAN_ORDER, PLANS, UNLIMITED, type PlanFeature, type PlanLimit } from '@talkzi/shared';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'Free, Pro and Agency plans in PKR or USD. WhatsApp conversation fees billed by Meta at cost.',
};

const limitRows: { key: PlanLimit; label: string }[] = [
  { key: 'phone_numbers', label: 'WhatsApp numbers' },
  { key: 'seats', label: 'Team members' },
  { key: 'contacts', label: 'Contacts' },
  { key: 'messages_per_month', label: 'Messages / month' },
  { key: 'broadcast_recipients_per_month', label: 'Broadcast recipients / month' },
  { key: 'chatbots', label: 'Chatbot flows' },
  { key: 'ai_credits_per_month', label: 'AI credits / month' },
  { key: 'client_workspaces', label: 'Client workspaces' },
];

const featureRows: { key: PlanFeature; label: string }[] = [
  { key: 'shared_inbox', label: 'Shared inbox & canned replies' },
  { key: 'broadcasts', label: 'Template broadcasts' },
  { key: 'chatbots', label: 'No-code chatbots' },
  { key: 'ai_inbox', label: 'AI replies, summaries & knowledge base' },
  { key: 'api_access', label: 'REST API' },
  { key: 'webhooks', label: 'Signed outbound webhooks' },
  { key: 'integrations', label: 'Shopify, WooCommerce, Zapier, n8n, Sheets' },
  { key: 'analytics_advanced', label: 'Advanced analytics & cost tracking' },
  { key: 'white_label', label: 'White-label branding' },
  { key: 'custom_domain', label: 'Custom domain' },
  { key: 'sub_accounts', label: 'Client sub-accounts' },
  { key: 'priority_support', label: 'Priority support' },
];

const fmt = (n: number) => (n === UNLIMITED ? 'Unlimited' : n === 0 ? '—' : n.toLocaleString('en-US'));

export default function PricingPage() {
  return (
    <>
      <PricingSection />
      <Section className="pt-0">
        <SectionHeading title="Compare plans" description="Every plan includes the official Cloud API, Embedded Signup and the 24-hour window guard." />
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">Plan limits and features</caption>
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="px-4 py-4 text-left text-muted-foreground">
                  Plan
                </th>
                {PLAN_ORDER.map((id) => (
                  <th key={id} scope="col" className="px-4 py-4 text-center font-semibold">
                    {PLANS[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {limitRows.map((row) => (
                <tr key={row.key} className="border-b border-border/60">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {row.label}
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <td key={id} className="px-4 py-3 text-center tabular-nums">
                      {fmt(PLANS[id].limits[row.key])}
                    </td>
                  ))}
                </tr>
              ))}
              {featureRows.map((row) => (
                <tr key={row.key} className="border-b border-border/60 last:border-0">
                  <th scope="row" className="px-4 py-3 text-left font-medium">
                    {row.label}
                  </th>
                  {PLAN_ORDER.map((id) => (
                    <td key={id} className="px-4 py-3 text-center">
                      {PLANS[id].features.includes(row.key) ? (
                        <Check className="mx-auto size-4 text-success" aria-label="Included" />
                      ) : (
                        <Minus className="mx-auto size-4 text-muted-foreground" aria-label="Not included" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          WhatsApp charges per delivered template message (marketing, utility, authentication) at Meta’s published rates.
          Replies within the 24-hour customer service window are free. Prices exclude applicable taxes.
        </p>
      </Section>
      <Faq />
      <CtaBand />
    </>
  );
}
