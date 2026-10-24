'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ImageUp } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { initials } from '@talkzi/ui/lib/initials';
import { COUNTRY_CODES, createWorkspaceSchema, TIMEZONES } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';
import { uploadPublicFile } from '@/lib/storage-client';

const schema = createWorkspaceSchema;
type Values = z.infer<typeof schema>;

export function GeneralSettingsForm(props: {
  workspaceId: string;
  name: string;
  logoUrl: string | null;
  timezone: string;
  defaultCountryCode: string;
}) {
  const router = useRouter();
  const [logo, setLogo] = React.useState(props.logoUrl);
  const [uploading, setUploading] = React.useState(false);
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: props.name, timezone: props.timezone, defaultCountryCode: props.defaultCountryCode },
  });

  async function onLogo(file: File | undefined) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error('Logo must be under 2 MB.');
    setUploading(true);
    try {
      const url = await uploadPublicFile('branding', `${props.workspaceId}/logo-${Date.now()}`, file);
      await apiFetch('/api/workspaces/current', { method: 'PATCH', body: { logoUrl: url } });
      setLogo(url);
      toast.success('Logo updated.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setUploading(false);
    }
  }

  async function onSubmit(values: Values) {
    try {
      await apiFetch('/api/workspaces/current', { method: 'PATCH', body: values });
      toast.success('Workspace settings saved.');
      form.reset(values);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save settings.');
    }
  }

  return (
    <div className="max-w-lg space-y-6">
      <div className="flex items-center gap-4">
        <div className="flex size-16 items-center justify-center overflow-hidden rounded-2xl bg-brand-gradient text-lg font-bold text-white">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Workspace logo" className="size-full object-cover" />
          ) : (
            initials(props.name)
          )}
        </div>
        <div>
          <Label htmlFor="logo-upload" className="cursor-pointer">
            <span className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm hover:border-primary/50">
              <ImageUp className="size-4" /> {uploading ? 'Uploading…' : 'Upload logo'}
            </span>
          </Label>
          <input
            id="logo-upload"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="sr-only"
            onChange={(e) => void onLogo(e.target.files?.[0])}
          />
          <p className="mt-1 text-xs text-muted-foreground">Square image, at least 128×128 px.</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5" noValidate>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workspace name</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Timezone</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {TIMEZONES.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="defaultCountryCode"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default country code</FormLabel>
                <Select value={field.value} onValueChange={field.onChange}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {COUNTRY_CODES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        +{c.code} · {c.country}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <Button type="submit" loading={form.formState.isSubmitting} disabled={!form.formState.isDirty}>
            Save changes
          </Button>
        </form>
      </Form>
    </div>
  );
}
