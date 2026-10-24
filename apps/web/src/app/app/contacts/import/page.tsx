import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@talkzi/ui/page-header';
import { ImportWizard } from '@/components/app/contacts/import-wizard';
import { requireRole } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Import contacts' };

export default async function ImportContactsPage() {
  const session = await requireRole('admin', '/app/contacts/import');
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6 lg:p-8">
      <Link href="/app/contacts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Contacts
      </Link>
      <PageHeader title="Import contacts" description="Bring your customer list from a spreadsheet or another tool." />
      <ImportWizard defaultCountryCode={session.workspace.default_country_code} />
    </div>
  );
}
