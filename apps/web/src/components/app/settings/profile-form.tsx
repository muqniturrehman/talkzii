'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Upload } from 'lucide-react';
import { UserAvatar } from '@talkzi/ui/avatar';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { toast } from '@talkzi/ui/sonner';
import { updateProfileSchema, type UpdateProfileInput } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';
import { uploadPublicFile } from '@/lib/storage-client';

export function ProfileForm({
  userId,
  email,
  fullName,
  avatarUrl,
  workspaceId,
}: {
  userId: string;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  workspaceId: string;
}) {
  const router = useRouter();
  const [avatar, setAvatar] = React.useState(avatarUrl);
  const [uploading, setUploading] = React.useState(false);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { fullName, avatarUrl },
  });

  async function onAvatar(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Please choose an image under 2 MB.');
    setUploading(true);
    try {
      const url = await uploadPublicFile('branding', `${workspaceId}/avatars/${userId}-${Date.now()}`, file);
      setAvatar(url);
      form.setValue('avatarUrl', url, { shouldDirty: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: UpdateProfileInput) {
    try {
      await apiFetch('/api/profile', { method: 'PATCH', body: values });
      toast.success('Profile saved.');
      form.reset(values);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save profile.');
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-md space-y-5" noValidate>
        <div className="flex items-center gap-4">
          <UserAvatar name={form.watch('fullName') || email} src={avatar} className="size-16 text-lg" />
          <div>
            <Label htmlFor="avatar-upload" className="cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/50">
                <Upload className="size-4" /> {uploading ? 'Uploading…' : 'Upload photo'}
              </span>
            </Label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => void onAvatar(e.target.files?.[0])}
            />
            <p className="mt-1 text-xs text-muted-foreground">PNG, JPG or WebP up to 2 MB.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">Email</Label>
          <Input id="profile-email" value={email ?? ''} disabled />
        </div>
        <FormField
          control={form.control}
          name="fullName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <Input autoComplete="name" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
          Save profile
        </Button>
      </form>
    </Form>
  );
}
