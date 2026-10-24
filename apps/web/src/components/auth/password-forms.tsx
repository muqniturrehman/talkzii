'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { MailCheck } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { toast } from '@talkzi/ui/sonner';
import {
  forgotPasswordSchema,
  newPasswordSchema,
  type ForgotPasswordInput,
  type NewPasswordInput,
} from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';

export function ForgotPasswordForm() {
  const [sent, setSent] = React.useState(false);
  const form = useForm<ForgotPasswordInput>({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: '' } });

  async function onSubmit(values: ForgotPasswordInput) {
    try {
      await apiFetch('/api/auth/forgot-password', { body: values });
      setSent(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.');
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <MailCheck className="size-10 text-success" aria-hidden />
        <p className="text-sm text-muted-foreground">
          If an account exists for that email, a reset link is on its way.
        </p>
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" autoComplete="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Send reset link
        </Button>
      </form>
    </Form>
  );
}

export function NewPasswordForm({
  endpoint = '/api/auth/reset-password',
  submitLabel = 'Update password',
  redirectTo,
}: {
  endpoint?: string;
  submitLabel?: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const form = useForm<NewPasswordInput>({
    resolver: zodResolver(newPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  });

  async function onSubmit(values: NewPasswordInput) {
    try {
      await apiFetch(endpoint, { body: values });
      toast.success('Password updated.');
      form.reset();
      if (redirectTo) router.replace(redirectTo);
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Could not update password.' });
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>New password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="confirm"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <Input type="password" autoComplete="new-password" {...field} />
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
        <Button type="submit" className="w-full sm:w-auto" loading={form.formState.isSubmitting}>
          {submitLabel}
        </Button>
      </form>
    </Form>
  );
}
