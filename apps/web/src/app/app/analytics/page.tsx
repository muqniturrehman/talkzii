import type { Metadata } from 'next';
import { PageHeader } from '@talkzi/ui/page-header';
import { AnalyticsDashboard } from '@/components/app/analytics/analytics-dashboard';
import { requireWorkspace } from '@/lib/auth/session';

export const metadata: Metadata = { title: 'Analytics' };

export default async function AnalyticsPage() {
  await requireWorkspace('/app/analytics');
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Analytics" description="Conversation volume, team responsiveness, customer satisfaction and WhatsApp costs. Days follow your workspace timezone." />
      <AnalyticsDashboard />
    </div>
  );
}
