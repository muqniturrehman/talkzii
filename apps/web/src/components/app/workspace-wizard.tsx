'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { ArrowLeft, ArrowRight, Check, Plus, Smartphone, Trash2 } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import {
  COUNTRY_CODES,
  createWorkspaceSchema,
  TIMEZONES,
  type CreateWorkspaceInput,
} from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';

const STEPS = ['Workspace', 'Region', 'Team', 'Done'] as const;

function guessTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return (TIMEZONES as readonly string[]).includes(tz) ? tz : 'Asia/Karachi';
  } catch {
    return 'Asia/Karachi';
  }
}

const slugPreview = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'workspace';

export function WorkspaceWizard({ plan }: { plan?: string }) {
  const router = useRouter();
  const [step, setStep] = React.useState(0);
  const [invites, setInvites] = React.useState<{ email: string; role: 'admin' | 'agent' | 'viewer' }[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  const form = useForm<CreateWorkspaceInput>({
    resolver: zodResolver(createWorkspaceSchema),
    defaultValues: { name: '', timezone: 'Asia/Karachi', defaultCountryCode: '92' },
    mode: 'onTouched',
  });

  React.useEffect(() => {
    form.setValue('timezone', guessTimezone());
  }, [form]);

  const name = form.watch('name');

  async function next() {
    if (step === 0 && !(await form.trigger('name'))) return;
    if (step === 1 && !(await form.trigger(['timezone', 'defaultCountryCode']))) return;
    if (step === 2) {
      await create();
      return;
    }
    setStep((s) => s + 1);
  }

  async function create() {
    setSubmitting(true);
    try {
      await apiFetch('/api/workspaces', { body: form.getValues() });
      const valid = invites.filter((i) => /\S+@\S+\.\S+/.test(i.email));
      const results = await Promise.allSettled(valid.map((invite) => apiFetch('/api/invitations', { body: invite })));
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed > 0) toast.warning(`${failed} invitation(s) could not be sent. You can retry from Team settings.`);
      setStep(3);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the workspace.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="glass rounded-2xl p-6 shadow-glow-lg sm:p-8">
      <ol className="mb-8 flex items-center justify-between gap-2" aria-label="Progress">
        {STEPS.map((label, index) => (
          <li key={label} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                index < step && 'bg-success text-white',
                index === step && 'bg-brand-gradient text-white shadow-glow',
                index > step && 'bg-muted text-muted-foreground',
              )}
              aria-current={index === step ? 'step' : undefined}
            >
              {index < step ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={cn('hidden text-xs font-medium sm:inline', index === step ? 'text-foreground' : 'text-muted-foreground')}>
              {label}
            </span>
            {index < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" aria-hidden /> : null}
          </li>
        ))}
      </ol>

      <Form {...form}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
          className="space-y-5"
          noValidate
        >
          {step === 0 ? (
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Business or workspace name</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="e.g. Lahore Lawn Co." {...field} />
                  </FormControl>
                  <FormDescription>
                    Your workspace URL: <span className="font-mono">talkzi.app/{slugPreview(name)}</span>
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          ) : null}

          {step === 1 ? (
            <>
              <FormField
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Timezone</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select timezone" />
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
                    <FormDescription>Used for analytics, schedules and business hours.</FormDescription>
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
                    <FormDescription>Applied to local numbers like 0300 1234567 when importing contacts.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </>
          ) : null}

          {step === 2 ? (
            <div className="space-y-3">
              <div>
                <p className="text-sm font-medium">Invite your team (optional)</p>
                <p className="text-xs text-muted-foreground">They’ll get an email with a secure link. You can do this later.</p>
              </div>
              {invites.map((invite, index) => (
                <div key={index} className="flex gap-2">
                  <Input
                    type="email"
                    aria-label={`Teammate ${index + 1} email`}
                    placeholder="teammate@business.com"
                    value={invite.email}
                    onChange={(e) =>
                      setInvites((list) => list.map((item, i) => (i === index ? { ...item, email: e.target.value } : item)))
                    }
                  />
                  <Select
                    value={invite.role}
                    onValueChange={(role) =>
                      setInvites((list) =>
                        list.map((item, i) => (i === index ? { ...item, role: role as 'admin' | 'agent' | 'viewer' } : item)),
                      )
                    }
                  >
                    <SelectTrigger className="w-32" aria-label="Role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="agent">Agent</SelectItem>
                      <SelectItem value="viewer">Viewer</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={() => setInvites((list) => list.filter((_, i) => i !== index))}
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
              {invites.length < 5 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setInvites((list) => [...list, { email: '', role: 'agent' }])}
                >
                  <Plus /> Add teammate
                </Button>
              ) : null}
            </div>
          ) : null}

          {step === 3 ? (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
                <Check className="size-7" />
              </div>
              <div>
                <p className="text-lg font-semibold">{name} is ready</p>
                <p className="text-sm text-muted-foreground">Next, connect your WhatsApp Business number with Meta.</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                <Button type="button" onClick={() => router.push('/app/sessions/connect')}>
                  <Smartphone /> Connect WhatsApp
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    router.push(plan && plan !== 'free' ? `/app/settings/billing?upgrade=${encodeURIComponent(plan)}` : '/app')
                  }
                >
                  {plan && plan !== 'free' ? 'Continue to billing' : 'Go to dashboard'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between pt-2">
              <Button type="button" variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft /> Back
              </Button>
              <Button type="submit" loading={submitting}>
                {step === 2 ? 'Create workspace' : 'Continue'} <ArrowRight />
              </Button>
            </div>
          )}
        </form>
      </Form>
    </div>
  );
}
