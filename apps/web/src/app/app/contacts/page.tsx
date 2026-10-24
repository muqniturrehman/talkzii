import type { Metadata } from 'next';
import Link from 'next/link';
import { Download, Upload } from 'lucide-react';
import { hasMinRole } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { PageHeader } from '@talkzi/ui/page-header';
import { AddContactDialog, LabelsDialog } from '@/components/app/contacts/contact-dialogs';
import { ContactsTable } from '@/components/app/contacts/contacts-table';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Contacts' };

export default async function ContactsPage() {
  const session = await requireWorkspace('/app/contacts');
  const role = session.workspace.role;

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] max-w-7xl flex-col gap-4 p-4 sm:p-6">
      <PageHeader
        title="Contacts"
        description="Everyone who has messaged you or was imported. Opted-out contacts never receive marketing broadcasts."
        actions={
          <div className="flex flex-wrap gap-2">
            <LabelsDialog />
            {hasMinRole(role, 'admin') ? (
              <>
                <Button asChild variant="outline">
                  <a href="/api/contacts/export" download>
                    <Download /> Export
                  </a>
                </Button>
                <Button asChild variant="outline">
                  <Link href="/app/contacts/import">
                    <Upload /> Import CSV
                  </Link>
                </Button>
              </>
            ) : null}
            {hasMinRole(role, 'agent') ? <AddContactDialog /> : null}
          </div>
        }
      />
      <ContactsTable />
    </div>
  );
}
