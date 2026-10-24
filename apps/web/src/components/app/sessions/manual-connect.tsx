'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Wrench } from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@talkzi/ui/accordion';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { toast } from '@talkzi/ui/sonner';
import { manualConnectSchema, type ManualConnectInput } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';

/** Owner-only developer fallback for connecting with a System User token. */
export function ManualConnect({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const form = useForm<ManualConnectInput>({
    resolver: zodResolver(manualConnectSchema),
    defaultValues: { wabaId: '', accessToken: '', pin: undefined },
  });

  async function onSubmit(values: ManualConnectInput) {
    try {
      const result = await apiFetch<{ phoneNumbers: { displayPhoneNumber: string }[]; warnings: string[] }>(
        '/api/meta/manual-connect',
        { body: { ...values, pin: values.pin || undefined } },
      );
      toast.success(`Connected ${result.phoneNumbers.length} number(s).`);
      result.warnings.forEach((w) => toast.warning(w));
      router.push('/app/sessions');
      router.refresh();
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Could not connect.' });
    }
  }

  return (
    <Accordion type="single" collapsible className="rounded-2xl border border-border px-5">
      <AccordionItem value="manual" className="border-0">
        <AccordionTrigger className="text-sm">
          <span className="flex items-center gap-2">
            <Wrench className="size-4" /> Advanced: connect with a System User token
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <p className="mb-4 text-sm">
            For development before your Meta app has Embedded Signup access. Create a System User in Business Settings,
            assign it your WhatsApp account with full control, and generate a token with{' '}
            <code>whatsapp_business_management</code> and <code>whatsapp_business_messaging</code>.
          </p>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="wabaId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>WhatsApp Business Account ID</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" placeholder="1234567890123456" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accessToken"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System User access token</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="off" placeholder="EAAG…" {...field} />
                    </FormControl>
                    <FormDescription>Stored encrypted with AES-256-GCM. Never shown again.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration PIN (optional)</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" maxLength={6} placeholder="6 digits" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root ? (
                <p role="alert" className="text-sm text-danger">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <Button type="submit" variant="outline" loading={form.formState.isSubmitting} disabled={disabled}>
                Connect account
              </Button>
            </form>
          </Form>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
