'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Bot, Plus } from 'lucide-react';
import type { ChatbotTrigger } from '@talkzi/shared';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@talkzi/ui/dialog';
import { EmptyState } from '@talkzi/ui/empty-state';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';

interface ChatbotListItem {
  id: string;
  name: string;
  description: string | null;
  status: 'draft' | 'active' | 'inactive';
  trigger: ChatbotTrigger;
  priority: number;
  updated_at: string;
}

const triggerSummary = (t: ChatbotTrigger) =>
  t.type === 'keyword'
    ? `Keywords: ${t.keywords.slice(0, 4).join(', ')}${t.keywords.length > 4 ? '…' : ''}`
    : t.type === 'first_message'
      ? "A new customer's first message"
      : 'Any message';

export function NewChatbotDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const flow = await apiFetch<{ id: string }>('/api/chatbots', { body: { name } });
      router.push(`/app/chatbots/${flow.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not create the chatbot');
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus /> New chatbot
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New chatbot</DialogTitle>
          <DialogDescription>We’ll start you with a greeting and a menu you can edit.</DialogDescription>
        </DialogHeader>
        <form onSubmit={create} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="bot-name">Name</Label>
            <Input id="bot-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Welcome menu" required />
          </div>
          <DialogFooter>
            <Button type="submit" loading={busy} disabled={!name.trim()}>
              Create & open builder
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ChatbotsList({ canCreate }: { canCreate: boolean }) {
  const flows = useQuery({ queryKey: ['chatbots'], queryFn: () => apiFetch<ChatbotListItem[]>('/api/chatbots') });
  if (flows.isPending) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-32 rounded-2xl" />
        ))}
      </div>
    );
  }
  if ((flows.data ?? []).length === 0) {
    return (
      <EmptyState
        icon={<Bot />}
        title="No chatbots yet"
        description="Answer FAQs, collect details and route customers 24/7 — then hand off to your team when needed."
        action={canCreate ? <NewChatbotDialog /> : undefined}
      />
    );
  }
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {flows.data?.map((flow) => (
        <li key={flow.id}>
          <Link
            href={`/app/chatbots/${flow.id}`}
            className="flex h-full flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition hover:border-primary/50 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-start justify-between gap-2">
              <span className="font-semibold">{flow.name}</span>
              <Badge variant={flow.status === 'active' ? 'success' : 'secondary'}>{flow.status}</Badge>
            </span>
            <span className="text-sm text-muted-foreground">{triggerSummary(flow.trigger)}</span>
            <span className="mt-auto text-xs text-muted-foreground">
              Priority {flow.priority} · edited {timeAgo(flow.updated_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
