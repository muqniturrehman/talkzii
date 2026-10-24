import { PageHeader } from '@talkzi/ui/page-header';
import { SettingsNav } from '@/components/app/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Settings" description="Manage your profile and workspace." />
      <SettingsNav />
      <div>{children}</div>
    </div>
  );
}
