import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { isSupabaseConfigured } from '@/lib/public-env';

/** Shown on auth pages when Supabase env vars are missing. */
export function SupabaseNotConfigured() {
  if (isSupabaseConfigured()) return null;
  return (
    <Alert variant="warning" className="mb-5">
      <TriangleAlert />
      <AlertTitle>Supabase isn’t configured</AlertTitle>
      <AlertDescription>
        Add <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{' '}
        <code>apps/web/.env.local</code> — see SETUP.md.
      </AlertDescription>
    </Alert>
  );
}
