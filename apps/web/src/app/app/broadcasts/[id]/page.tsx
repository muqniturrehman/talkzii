import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { BroadcastDetail } from '@/components/app/broadcasts/broadcast-detail';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Broadcast' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function BroadcastPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireWorkspace(`/app/broadcasts/${id}`);
  if (!UUID_RE.test(id)) notFound();
  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6 lg:p-8">
      <BroadcastDetail id={id} />
    </div>
  );
}
