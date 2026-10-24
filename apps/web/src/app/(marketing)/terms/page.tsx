import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPage, type LegalSection } from '@/components/marketing/legal-page';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of Talkzi, including WhatsApp Business Platform policies and acceptable use.',
};

const { emails, legalEntity } = siteConfig;

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'Agreement',
    content: (
      <p>
        These Terms form a binding agreement between you (or the organisation you represent) and {legalEntity}{' '}
        (“Talkzi”, “we”). By creating an account or using Talkzi you accept these Terms and our{' '}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    id: 'service',
    title: 'The service',
    content: (
      <p>
        Talkzi provides a web application for managing WhatsApp conversations, broadcasts, chatbots, analytics and
        integrations through Meta’s official WhatsApp Business Cloud API. Features vary by plan and may evolve over
        time.
      </p>
    ),
  },
  {
    id: 'accounts',
    title: 'Accounts and workspaces',
    content: (
      <ul>
        <li>You must provide accurate information and keep your credentials secure.</li>
        <li>Workspace owners and admins are responsible for the people they invite and the roles they assign.</li>
        <li>You are responsible for all activity in your workspace.</li>
      </ul>
    ),
  },
  {
    id: 'whatsapp',
    title: 'WhatsApp Business Platform',
    content: (
      <>
        <p>
          Your use of WhatsApp through Talkzi is also subject to the WhatsApp Business Terms of Service, the WhatsApp
          Business Messaging Policy and the WhatsApp Commerce Policy. You own your WhatsApp Business Account and phone
          numbers. Meta may restrict or disable accounts that violate its policies or receive poor quality ratings;
          Talkzi is not responsible for decisions made by Meta.
        </p>
        <p>
          WhatsApp messaging fees are charged by Meta according to its published rates and are separate from your
          Talkzi subscription.
        </p>
      </>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    content: (
      <>
        <p>You agree not to use Talkzi to:</p>
        <ul>
          <li>message people who have not opted in to receive messages from you, or ignore opt-out requests;</li>
          <li>send spam, deceptive content, malware or phishing;</li>
          <li>promote prohibited goods or services under WhatsApp’s Commerce Policy or applicable law;</li>
          <li>harass, threaten or discriminate against anyone;</li>
          <li>violate the Prevention of Electronic Crimes Act 2016 or any other applicable law;</li>
          <li>interfere with, probe or overload our systems, or circumvent usage limits.</li>
        </ul>
        <p>We may suspend workspaces that put the platform, our users or our relationship with Meta at risk.</p>
      </>
    ),
  },
  {
    id: 'customer-data',
    title: 'Your data',
    content: (
      <p>
        You retain all rights to the data you put into Talkzi (“Customer Data”). You grant us a limited licence to host,
        process and transmit Customer Data only to provide and improve the service and as described in the Privacy
        Policy. You are responsible for having a lawful basis, including any required consent, for the personal data
        you process with Talkzi. A data processing agreement is available on request.
      </p>
    ),
  },
  {
    id: 'fees',
    title: 'Fees and payment',
    content: (
      <ul>
        <li>Paid plans are billed in advance monthly or yearly in PKR or USD, plus applicable taxes.</li>
        <li>Subscriptions renew automatically until cancelled; you can cancel anytime from Settings → Billing.</li>
        <li>Cancellation takes effect at the end of the current billing period. Fees already paid are non-refundable except where required by law.</li>
        <li>We may change prices with at least 30 days’ notice before your next renewal.</li>
      </ul>
    ),
  },
  {
    id: 'ai',
    title: 'AI features',
    content: (
      <p>
        AI-generated suggestions, summaries and classifications may be inaccurate. Review AI output before sending it
        to customers. You are responsible for messages sent from your workspace.
      </p>
    ),
  },
  {
    id: 'third-party',
    title: 'Third-party services',
    content: (
      <p>
        Integrations (such as Shopify, WooCommerce, Zapier, n8n, Google Sheets, Stripe, JazzCash and Easypaisa) are
        provided by third parties under their own terms. We are not responsible for third-party services.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Availability and support',
    content: (
      <p>
        We aim for high availability but do not guarantee uninterrupted service, especially where it depends on Meta
        or other providers. Support is available by email at <a href={`mailto:${emails.support}`}>{emails.support}</a>.
      </p>
    ),
  },
  {
    id: 'ip',
    title: 'Intellectual property',
    content: (
      <p>
        Talkzi, its software and branding are owned by {legalEntity}. Agency plans may white-label the interface for
        their clients, but may not resell the software outside the service.
      </p>
    ),
  },
  {
    id: 'termination',
    title: 'Termination',
    content: (
      <p>
        You may stop using Talkzi at any time and delete your workspace. We may suspend or terminate access for material
        breach of these Terms. After termination you can request an export of your data for 30 days.
      </p>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    content: (
      <p>
        Except as expressly stated, Talkzi is provided “as is” without warranties of any kind, to the extent permitted
        by law.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    content: (
      <p>
        To the maximum extent permitted by law, our total liability for any claim is limited to the fees you paid in the
        twelve months before the claim, and we are not liable for indirect or consequential losses, lost profits or
        lost data.
      </p>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    content: (
      <p>
        You will indemnify us against claims arising from your Customer Data, your messages or your breach of these
        Terms or of WhatsApp’s policies.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law',
    content: (
      <p>
        These Terms are governed by the laws of the Islamic Republic of Pakistan. The courts of Islamabad have exclusive
        jurisdiction, unless mandatory consumer law gives you the right to bring proceedings elsewhere.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes',
    content: <p>We may update these Terms. Material changes will be notified to workspace owners at least 30 days in advance.</p>,
  },
  {
    id: 'contact',
    title: 'Contact',
    content: (
      <p>
        Questions about these Terms: <a href={`mailto:${emails.support}`}>{emails.support}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="Please read these terms carefully. They explain your rights and obligations when using Talkzi."
      sections={sections}
    />
  );
}
