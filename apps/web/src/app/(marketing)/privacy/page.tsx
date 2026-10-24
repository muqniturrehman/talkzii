import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/marketing/legal-page';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Talkzi collects, uses, shares and protects personal data, including data from the WhatsApp Business Platform.',
};

const { emails, legalEntity, address } = siteConfig;

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    content: (
      <>
        <p>
          Talkzi is a software platform operated by <strong>{legalEntity}</strong> ({address}) that lets businesses
          manage WhatsApp conversations, broadcasts and automation through Meta’s official WhatsApp Business Platform.
        </p>
        <p>
          Questions about this policy can be sent to <a href={`mailto:${emails.privacy}`}>{emails.privacy}</a>.
        </p>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Our role: controller and processor',
    content: (
      <>
        <p>
          <strong>Controller.</strong> We act as data controller for information about our own customers and users —
          for example account details, billing information and how you use Talkzi.
        </p>
        <p>
          <strong>Processor.</strong> When a business uses Talkzi to message its customers, that business is the
          controller of its customers’ data (names, phone numbers, message content). We process that data only on the
          business’s instructions, as described in our Terms of Service. If you are a customer of a business that uses
          Talkzi, please contact that business first to exercise your rights.
        </p>
      </>
    ),
  },
  {
    id: 'data-we-collect',
    title: 'Information we collect',
    content: (
      <ul>
        <li>
          <strong>Account information:</strong> name, email address, password hash (managed by our authentication
          provider), profile picture and workspace membership.
        </li>
        <li>
          <strong>Workspace data:</strong> workspace name, logo, settings, team members, roles and invitations.
        </li>
        <li>
          <strong>WhatsApp Business Platform data:</strong> when you connect WhatsApp through Meta Embedded Signup we
          receive your WhatsApp Business Account ID, business portfolio ID, phone number IDs, display names, quality
          ratings, message templates, and a business access token. When you send or receive messages we process
          message content, media, timestamps, delivery and read statuses, and pricing categories.
        </li>
        <li>
          <strong>Contact data you upload or receive:</strong> names, phone numbers, emails, custom fields, labels and
          opt-in / opt-out status of your customers.
        </li>
        <li>
          <strong>Billing data:</strong> plan, invoices and payment status. Card payments are processed by Stripe and
          local payments by JazzCash or Easypaisa; we never store full card numbers.
        </li>
        <li>
          <strong>Technical data:</strong> IP address, browser type, device information, logs and security events.
        </li>
      </ul>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use information',
    content: (
      <ul>
        <li>To provide the service: sending and receiving WhatsApp messages on your behalf, running broadcasts, chatbots and analytics.</li>
        <li>To provide optional AI features (reply suggestions, summaries, sentiment, intent and knowledge-base answers) when enabled in your workspace.</li>
        <li>To bill you, prevent fraud and abuse, and keep the platform secure.</li>
        <li>To provide support and communicate service updates.</li>
        <li>To improve Talkzi using aggregated, de-identified usage statistics.</li>
        <li>To comply with legal obligations and enforce our terms.</li>
      </ul>
    ),
  },
  {
    id: 'meta-data',
    title: 'Data obtained through Meta Platforms',
    content: (
      <>
        <p>
          Talkzi requests the <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code>{' '}
          permissions solely to provide the features you use: connecting your WhatsApp Business Account, managing
          phone numbers and templates, and sending and receiving messages. We do not use Meta Platform data for
          advertising, we do not sell it, and we do not share it except with the service providers listed below that
          help us run Talkzi.
        </p>
        <p>
          Access tokens are encrypted with AES-256-GCM before storage. You can disconnect Talkzi at any time from your
          Meta Business settings or from Talkzi; see our <Link href="/data-deletion">data deletion instructions</Link>.
          We comply with the Meta Platform Terms and Developer Policies.
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI processing',
    content: (
      <p>
        When AI features are enabled, relevant conversation snippets and knowledge-base documents are sent to our AI
        providers (OpenAI or Anthropic) to generate a response. Under their API terms these providers do not use API
        data to train their models. Workspace admins can disable AI features at any time.
      </p>
    ),
  },
  {
    id: 'sharing',
    title: 'Sharing and sub-processors',
    content: (
      <>
        <p>We share data only with providers that help us operate Talkzi, under contracts that protect your data:</p>
        <ul>
          <li><strong>Meta Platforms</strong> — WhatsApp Business Cloud API (message delivery).</li>
          <li><strong>Supabase</strong> — database, authentication, file storage and realtime.</li>
          <li><strong>Vercel</strong> — application hosting.</li>
          <li><strong>Upstash</strong> — queues and rate limiting.</li>
          <li><strong>OpenAI / Anthropic</strong> — optional AI features.</li>
          <li><strong>Stripe, JazzCash, Easypaisa</strong> — payment processing.</li>
          <li><strong>Resend</strong> — transactional email.</li>
        </ul>
        <p>We may also disclose information if required by law or to protect the rights and safety of our users.</p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    content: (
      <p>
        Our providers may process data outside Pakistan, including in the United States and the European Union. Where
        required, we rely on appropriate safeguards such as Standard Contractual Clauses.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'Retention',
    content: (
      <ul>
        <li>Account data is kept while your account is active.</li>
        <li>
          Message and contact data is kept according to your workspace’s retention setting (365 days by default,
          configurable in Settings → Compliance).
        </li>
        <li>After workspace deletion, data is removed within 30 days, and from backups within a further 30 days.</li>
        <li>Invoices and records we must keep by law are retained for the legally required period.</li>
      </ul>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    content: (
      <p>
        We use TLS for data in transit, encryption at rest, AES-256-GCM encryption for WhatsApp access tokens,
        row-level security to isolate every workspace, role-based access control, hashed API keys, signed webhooks and
        audit logs. Read more on our <Link href="/security">security page</Link>.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your rights',
    content: (
      <>
        <p>
          Depending on where you live, you may have the right to access, correct, delete, export or restrict the
          processing of your personal data, and to object to processing or withdraw consent. Workspace admins can
          export or delete contact data directly in Settings → Compliance.
        </p>
        <p>
          To exercise your rights, email <a href={`mailto:${emails.privacy}`}>{emails.privacy}</a>. We respond within 30
          days. You may also complain to your local data protection authority.
        </p>
      </>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    content: <p>Talkzi is a business tool and is not directed to children under 16. We do not knowingly collect their data.</p>,
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    content: (
      <p>
        We use strictly necessary cookies to keep you signed in and secure. Your theme preference (light or dark) is
        stored in your browser’s local storage. We do not use third-party advertising cookies.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    content: <p>We will post updates on this page and, for material changes, notify workspace owners by email.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    content: (
      <p>
        {legalEntity}, {address}. Email: <a href={`mailto:${emails.privacy}`}>{emails.privacy}</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="This policy explains what personal data Talkzi collects, why, how we protect it and the choices you have."
      sections={sections}
    />
  );
}
