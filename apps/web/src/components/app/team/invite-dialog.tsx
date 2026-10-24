'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Copy, UserPlus } from 'lucide-react';
import { Button } from '@talkzi/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@talkzi/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@talkzi/ui/form';
import { Input } from '@talkzi/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { createInvitationSchema, ROLE_META, type CreateInvitationInput } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';

export function InviteDialog({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(defaultOpen);
  const [link, setLink] = React.useState<string | null>(null);
  const form = useForm<CreateInvitationInput>({
    resolver: zodResolver(createInvitationSchema),
    defaultValues: { email: '', role: 'agent' },
  });

  async function onSubmit(values: CreateInvitationInput) {
    try {
      const result = await apiFetch<{ inviteUrl: string; emailDelivered: boolean }>('/api/invitations', { body: values });
      if (result.emailDelivered) {
        toast.success(`Invitation sent to ${values.email}`);
        setOpen(false);
      } else {
        setLink(result.inviteUrl);
        toast.info('Email isn’t configured — share the invite link manually.');
      }
      form.reset({ email: '', role: values.role });
      router.refresh();
    } catch (error) {
      form.setError('root', { message: error instanceof Error ? error.message : 'Could not send the invitation.' });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setLink(null);
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <UserPlus /> Invite teammate
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite a teammate</DialogTitle>
          <DialogDescription>They’ll receive a secure link that expires in 7 days.</DialogDescription>
        </DialogHeader>
        {link ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Share this link with your teammate:</p>
            <div className="flex gap-2">
              <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
              <Button
                variant="outline"
                size="icon"
                aria-label="Copy link"
                onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}
              >
                <Copy />
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setLink(null)}>
                Invite another
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" noValidate>
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="teammate@business.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {(['admin', 'agent', 'viewer'] as const).map((role) => (
                          <SelectItem key={role} value={role}>
                            {ROLE_META[role].label} — {ROLE_META[role].description}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {form.formState.errors.root ? (
                <p role="alert" className="text-sm text-danger">
                  {form.formState.errors.root.message}
                </p>
              ) : null}
              <DialogFooter>
                <Button type="submit" loading={form.formState.isSubmitting}>
                  Send invitation
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
