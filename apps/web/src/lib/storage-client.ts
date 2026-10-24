'use client';

import { getSupabaseBrowserClient } from '@/lib/supabase/client';

/**
 * Uploads a file to a Supabase Storage bucket under the caller's workspace
 * folder (enforced by storage RLS) and returns its public URL.
 */
export async function uploadPublicFile(bucket: 'branding', path: string, file: File): Promise<string> {
  const supabase = getSupabaseBrowserClient();
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'bin';
  const fullPath = `${path}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(fullPath, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: '3600',
  });
  if (error) throw new Error(error.message);
  return supabase.storage.from(bucket).getPublicUrl(fullPath).data.publicUrl;
}
