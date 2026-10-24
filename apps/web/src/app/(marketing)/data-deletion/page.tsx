import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LegalPage, type LegalSection } from '@/components/marketing/legal-page';
import { siteConfig } from '@/config/site';
import { DeletionStatusLookup } from './status-lookup';

export const metadata: Metadata = {
  title: 'Data deletion',
  description: 'How to delete your Talkzi account and data, disconnect Meta, and check the status of a deletion request.',
};

const { emails } = siteConfig;

const sections: LegalSection[] = [
  {
    id: 'workspace-owners',
    title: 'Delete your Talkzi account or workspace',
    content: (
      <>
        <p>Workspace owners can delete all workspace data themselves:</p>
        <ul>
          <li>Sign in and open <strong>Settings → Compliance</strong>.</li>
          <li>Use <strong>Export data</strong> first if you want a copy.</li>
          <li>Choose <strong>Delete workspace</strong> and confirm. Contacts, conversations, messages, templates, media and WhatsApp tokens are deleted.</li>
        </ul>
        <p>
          Prefer email? Write to <a href={`mailto:${emails.privacy}`}>{emails.privacy}</a> from your account email and
          we will process the request within 30 days.
        </p>
      </>
    ),
  },
  {
    id: 'meta',
    title: 'Remove Talkzi from Facebook / Meta',
    content: (
      <>
        <p>If you connected WhatsApp with Facebook Login (Embedded Signup), you can revoke access at any time:</p>
        <ul>
          <li>Open Facebook → <strong>Settings &amp; privacy → Settings → Business integrations</strong>.</li>
          <li>Find <strong>Talkzi</strong>, select it and click <strong>Remove</strong>.</li>
          <li>Optionally tick “Delete posts, photos and videos…” to request deletion of data Talkzi received from Meta.</li>
        </ul>
        <p>
          Meta notifies Talkzi automatically. We delete the related access tokens and Meta-derived data within 30 days
          and give you a confirmation code you can check below.
        </p>
      </>
    ),
  },
  {
    id: 'end-customers',
    title: 'If you messaged a business that uses Talkzi',
    content: (
      <>
        <p>
          The business you messaged controls your conversation data. Contact them directly to access or delete it. You
          can also reply <strong>STOP</strong> in WhatsApp to stop marketing messages from that business.
        </p>
        <p>
          If you can’t reach the business, email <a href={`mailto:${emails.privacy}`}>{emails.privacy}</a> with the
          business name and your phone number and we will help.
        </p>
      </>
    ),
  },
  {
    id: 'what-is-deleted',
    title: 'What we delete and what we keep',
    content: (
      <ul>
        <li>Deleted: profile, workspace data, contacts, messages, media, templates, chatbot flows and access tokens.</li>
        <li>Kept only where legally required: invoices and payment records, and security logs for up to 90 days.</li>
        <li>Backups are overwritten within 30 days of deletion.</li>
      </ul>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data deletion instructions"
      intro="You can delete your data at any time. This page explains how, and lets you check the status of a request."
      sections={sections}
    >
      <section id="status" className="scroll-mt-24 rounded-2xl border border-border p-6">
        <h2 className="text-xl font-semibold">Check a deletion request</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Enter the confirmation code you received to see the current status.
        </p>
        <Suspense fallback={null}>
          <DeletionStatusLookup />
        </Suspense>
      </section>
    </LegalPage>
  );
}
