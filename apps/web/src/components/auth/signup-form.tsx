'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { MailCheck } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { signupSchema, type SignupInput } from '@talkzi/shared';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { Divider } from './auth-card';
import { GoogleButton } from './google-button';

export function SignupForm({ next, defaultEmail = '' }: { next: string; defaultEmail?: string }) {
  const router = useRouter();
  const [confirmEmail, setConfirmEmail] = React.useState<string | null>(null);
  const form = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: '', email: defaultEmail, password: '', next },
  });

  async function onSubmit(values: SignupInput) {
    try {
      const result = await apiFetch<{ needsConfirmation: boolean; next: string }>('/api/auth/signup', { body: values });
      if (result.needsConfirmation) {
        setConfirmEmail(values.email);
        return;
      }
      router.replace(result.next);
      router.refresh();
    } catch (error) {
      if (error instanceof ApiClientError) {
        for (const [field, messages] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof SignupInput, { message: messages[0] });
        }
        form.setError('root', { message: error.message });
      } else {
        form.setError('root', { message: 'Sign-up failed. Please try again.' });
      }
    }
  }

  if (confirmEmail) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <MailCheck className="size-10 text-success" aria-hidden />
        <p className="font-medium">Confirm your email</p>
        <p className="text-sm text-muted-foreground">
          We sent a confirmation link to <strong className="text-foreground">{confirmEmail}</strong>. Click it to
          activate your account.
        </p>
      </div>
    );
  }

  return (
    <div>
      <GoogleButton next={next} label="Sign up with Google" />
      <Divider />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Full name</FormLabel>
                <FormControl>
                  <Input autoComplete="name" placeholder="Ayesha Khan" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Work email</FormLabel>
                <FormControl>
                  <Input type="email" autoComplete="email" placeholder="you@business.com" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Password</FormLabel>
                <FormControl>
                  <Input type="password" autoComplete="new-password" placeholder="At least 8 characters" {...field} />
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
          <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
            Create account
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            By signing up you agree to our{' '}
            <Link href="/terms" className="underline hover:text-foreground">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline hover:text-foreground">
              Privacy Policy
            </Link>
            .
          </p>
        </form>
      </Form>
    </div>
  );
}
