import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ContactProfile } from '@/components/app/contacts/contact-profile';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Contact' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireWorkspace(`/app/contacts/${id}`);
  if (!UUID_RE.test(id)) notFound();
  return <ContactProfile id={id} />;
}
