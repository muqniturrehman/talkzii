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
import { toast } from '@talkzi/ui/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@talkzi/ui/tabs';
import { loginSchema, magicLinkSchema, type LoginInput, type MagicLinkInput } from '@talkzi/shared';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { Divider } from './auth-card';
import { GoogleButton } from './google-button';

function PasswordForm({ next }: { next: string }) {
  const router = useRouter();
  const form = useForm<LoginInput>({ resolver: zodResolver(loginSchema), defaultValues: { email: '', password: '', next } });

  async function onSubmit(values: LoginInput) {
    try {
      const result = await apiFetch<{ next: string }>('/api/auth/login', { body: values });
      router.replace(result.next);
      router.refresh();
    } catch (error) {
      const message = error instanceof ApiClientError ? error.message : 'Sign-in failed.';
      form.setError('root', { message });
    }
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
              <div className="flex items-center justify-between">
                <FormLabel>Password</FormLabel>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <Input type="password" autoComplete="current-password" {...field} />
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
          Sign in
        </Button>
      </form>
    </Form>
  );
}

function MagicLinkForm({ next }: { next: string }) {
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const form = useForm<MagicLinkInput>({ resolver: zodResolver(magicLinkSchema), defaultValues: { email: '', next } });

  async function onSubmit(values: MagicLinkInput) {
    try {
      await apiFetch('/api/auth/magic-link', { body: values });
      setSentTo(values.email);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not send the link.');
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center" role="status">
        <MailCheck className="size-10 text-success" aria-hidden />
        <p className="font-medium">Check your inbox</p>
        <p className="text-sm text-muted-foreground">
          We sent a sign-in link to <strong className="text-foreground">{sentTo}</strong>.
        </p>
        <Button variant="link" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
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
                <Input type="email" autoComplete="email" placeholder="you@business.com" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" className="w-full" loading={form.formState.isSubmitting}>
          Email me a magic link
        </Button>
      </form>
    </Form>
  );
}

export function LoginForm({ next }: { next: string }) {
  return (
    <div>
      <GoogleButton next={next} />
      <Divider />
      <Tabs defaultValue="password">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="password">Password</TabsTrigger>
          <TabsTrigger value="magic">Magic link</TabsTrigger>
        </TabsList>
        <TabsContent value="password">
          <PasswordForm next={next} />
        </TabsContent>
        <TabsContent value="magic">
          <MagicLinkForm next={next} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
