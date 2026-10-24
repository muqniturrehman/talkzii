import {
  BarChart3,
  Bot,
  FileCheck2,
  Megaphone,
  MessagesSquare,
  Plug,
  ShieldCheck,
  Sparkles,
  Users,
  type LucideIcon,
} from 'lucide-react';

export interface Feature {
  icon: LucideIcon;
  title: string;
  description: string;
  bullets: string[];
}

export const features: Feature[] = [
  {
    icon: MessagesSquare,
    title: 'Shared team inbox',
    description: 'Every WhatsApp chat in one place, with assignments, notes and live collision detection.',
    bullets: ['Assign, snooze & resolve', 'Internal notes & @mentions', 'Canned replies with /shortcuts'],
  },
  {
    icon: Megaphone,
    title: 'Broadcasts that convert',
    description: 'Send approved templates to segmented audiences with scheduling and live delivery stats.',
    bullets: ['Label & CSV audiences', 'Personalised variables', 'Sent → delivered → read → replied'],
  },
  {
    icon: Bot,
    title: 'No-code chatbots',
    description: 'Drag-and-drop flows with questions, conditions, API calls and smooth hand-off to humans.',
    bullets: ['Keyword & first-message triggers', 'HTTP request + variables', 'Assign to a human anytime'],
  },
  {
    icon: Sparkles,
    title: 'AI inbox assistant',
    description: 'Suggested replies, thread summaries, sentiment and intent — trained on your own documents.',
    bullets: ['Reply suggestions in English & Urdu', 'Knowledge base (RAG)', 'OpenAI or Claude'],
  },
  {
    icon: ShieldCheck,
    title: 'Official Cloud API',
    description: 'Connect in minutes with Meta Embedded Signup. No QR codes, no unofficial tools, no ban risk.',
    bullets: ['Embedded Signup onboarding', '24h window enforced for you', 'Quality rating monitoring'],
  },
  {
    icon: FileCheck2,
    title: 'Template studio',
    description: 'Build message templates with a live WhatsApp preview, submit to Meta and track approval.',
    bullets: ['Text, media & button templates', 'Variable samples built in', 'Approval status in real time'],
  },
  {
    icon: Users,
    title: 'CRM & contacts',
    description: 'Custom fields, labels, CSV import and opt-out management for every customer.',
    bullets: ['CSV import wizard', 'Custom fields & labels', 'STOP / opt-out handling'],
  },
  {
    icon: BarChart3,
    title: 'Analytics & cost tracking',
    description: 'Response times, CSAT, broadcast ROI and Meta conversation costs by category.',
    bullets: ['First-response time', 'Marketing vs utility spend', 'Number quality history'],
  },
  {
    icon: Plug,
    title: 'Integrations & API',
    description: 'Shopify, WooCommerce, Zapier, n8n, Google Sheets, signed webhooks and a REST API.',
    bullets: ['HMAC-signed webhooks', 'Scoped API keys', 'JazzCash & Easypaisa ready'],
  },
];

export const steps = [
  {
    title: 'Connect your number',
    description:
      'Click "Connect WhatsApp" and finish Meta Embedded Signup in about two minutes — business, WhatsApp account and number in one flow.',
  },
  {
    title: 'Import & prepare',
    description: 'Upload contacts from CSV, create message templates with a live preview and set up your chatbot.',
  },
  {
    title: 'Chat, broadcast & automate',
    description: 'Your team replies from one inbox while broadcasts, bots and AI handle the rest — all on the official API.',
  },
];

export type CompareValue = 'yes' | 'no' | 'partial';

export const compareCompetitors = ['Talkzi', 'Wati', 'AiSensy', 'WhatChimp', 'Interakt'] as const;

/**
 * TODO(before launch): verify competitor data. Cells reflect publicly
 * available information as understood in 2026; "partial" = varies by plan or
 * available as an add-on.
 */
export const compareRows: { feature: string; values: CompareValue[] }[] = [
  { feature: 'Official WhatsApp Cloud API', values: ['yes', 'yes', 'yes', 'yes', 'yes'] },
  { feature: 'Pricing in PKR', values: ['yes', 'no', 'no', 'no', 'no'] },
  { feature: 'Urdu-ready inbox & AI replies', values: ['yes', 'no', 'no', 'no', 'no'] },
  { feature: 'JazzCash & Easypaisa payments', values: ['yes', 'no', 'no', 'no', 'no'] },
  { feature: 'Agency / multi-client workspaces', values: ['yes', 'partial', 'partial', 'partial', 'partial'] },
  { feature: 'AI inbox (replies, summaries, RAG)', values: ['yes', 'partial', 'partial', 'partial', 'partial'] },
  { feature: 'Open webhooks & REST API on Pro', values: ['yes', 'partial', 'partial', 'partial', 'partial'] },
  { feature: 'Full white-label + custom domain', values: ['yes', 'no', 'partial', 'partial', 'no'] },
];

/** TODO(before launch): replace with real customer quotes (with permission). */
export const testimonials = [
  {
    quote:
      'We moved our whole order support from personal phones to Talkzi. Replies went from hours to minutes, and the team finally sees every chat.',
    name: 'Ayesha K.',
    role: 'Founder, fashion brand · Lahore',
  },
  {
    quote:
      'Broadcasts with real delivery and read stats changed how we run sales. The cost-by-category view keeps our Meta bill predictable.',
    name: 'Bilal R.',
    role: 'Growth lead, electronics retailer · Karachi',
  },
  {
    quote:
      'Running twelve client brands under our own logo and domain is exactly what our agency needed. PKR billing is a bonus.',
    name: 'Sana M.',
    role: 'Agency owner · Islamabad',
  },
];

export const faqs = [
  {
    q: 'Is Talkzi built on the official WhatsApp Business API?',
    a: 'Yes. Talkzi runs entirely on Meta’s official WhatsApp Business Cloud API and onboards you with Meta Embedded Signup. There are no QR codes, browser sessions or unofficial libraries — so there is no risk of your number being banned for using unofficial tools.',
  },
  {
    q: 'What do I need to get started?',
    a: 'A phone number that can receive an SMS or voice call, and a Meta (Facebook) account. Embedded Signup creates or connects your Meta Business portfolio and WhatsApp Business Account during onboarding.',
  },
  {
    q: 'Can I use my existing WhatsApp number?',
    a: 'Yes. A number can be connected to the API through one provider at a time. If it is currently active in the WhatsApp or WhatsApp Business app, Meta’s onboarding guides you through moving it.',
  },
  {
    q: 'How much does WhatsApp itself charge?',
    a: 'Meta charges per delivered template message for marketing, utility and authentication categories, with rates that vary by country. Replies inside the 24-hour customer service window are free. Meta bills these fees directly; Talkzi shows a live cost estimate in Analytics.',
  },
  {
    q: 'What is the 24-hour customer service window?',
    a: 'When a customer messages you, you can reply freely for 24 hours. After that, WhatsApp only allows approved message templates. Talkzi tracks the window for every chat and switches the composer to templates automatically.',
  },
  {
    q: 'Can I pay in PKR with JazzCash or Easypaisa?',
    a: 'Yes. Every plan is priced in both PKR and USD. Pay by card internationally, or with JazzCash and Easypaisa in Pakistan.',
  },
  {
    q: 'How do you keep my data safe?',
    a: 'Data is encrypted in transit and at rest, WhatsApp access tokens are additionally encrypted with AES-256-GCM, and every workspace is isolated with row-level security. Export and deletion tools help you meet GDPR and local data-protection duties.',
  },
  {
    q: 'Do you support agencies and resellers?',
    a: 'Yes. The Agency plan lets you manage unlimited client workspaces under your own brand, logo and custom domain, with per-client billing and permissions.',
  },
];

export const trustLogos = ['Lawnly', 'Chai Co.', 'Bazaar Box', 'NovaMart', 'Karigar'];
