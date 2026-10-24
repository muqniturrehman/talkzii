'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, MoreHorizontal, PenLine, RefreshCw, Star, Unplug } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@talkzi/ui/alert-dialog';
import { Button } from '@talkzi/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@talkzi/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@talkzi/ui/dropdown-menu';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { toast } from '@talkzi/ui/sonner';
import { apiFetch } from '@/lib/api/client';

async function act(body: Record<string, unknown>, success: string) {
  await apiFetch('/api/meta/register-number', { body });
  toast.success(success);
}

export function PhoneNumberActions({
  phoneNumberId,
  isRegistered,
  isDefault,
  displayName,
}: {
  phoneNumberId: string;
  isRegistered: boolean;
  isDefault: boolean;
  displayName: string | null;
}) {
  const router = useRouter();
  const [dialog, setDialog] = React.useState<'register' | 'name' | null>(null);
  const [pin, setPin] = React.useState('');
  const [name, setName] = React.useState(displayName ?? '');
  const [busy, setBusy] = React.useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      setDialog(null);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!isRegistered ? (
        <Button size="sm" onClick={() => setDialog('register')}>
          <KeyRound /> Register
        </Button>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="Number actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isDefault ? (
            <DropdownMenuItem
              onSelect={() => void run(() => act({ action: 'set_default', phoneNumberId }, 'Default number updated.'))}
            >
              <Star /> Make default
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={() => setDialog('name')}>
            <PenLine /> Request display name change
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('register')}>
            <KeyRound /> {isRegistered ? 'Re-register with PIN' : 'Register with PIN'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={dialog === 'register'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register number on the Cloud API</DialogTitle>
            <DialogDescription>
              Choose a 6-digit two-step verification PIN. Keep it safe — you’ll need it to move this number later.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`pin-${phoneNumberId}`}>6-digit PIN</Label>
            <Input
              id={`pin-${phoneNumberId}`}
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
            />
          </div>
          <DialogFooter>
            <Button
              loading={busy}
              disabled={pin.length !== 6}
              onClick={() => void run(() => act({ action: 'register', phoneNumberId, pin }, 'Number registered.'))}
            >
              Register number
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'name'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request a display name change</DialogTitle>
            <DialogDescription>
              Meta reviews new display names (usually within 1–2 business days). The name must match your business
              branding and Meta’s display name guidelines.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor={`name-${phoneNumberId}`}>New display name</Label>
            <Input id={`name-${phoneNumberId}`} value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <DialogFooter>
            <Button
              loading={busy}
              disabled={name.trim().length < 3}
              onClick={() =>
                void run(() => act({ action: 'display_name', phoneNumberId, displayName: name }, 'Name change submitted to Meta.'))
              }
            >
              Submit for review
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function WabaActions({ wabaAccountId, disabled }: { wabaAccountId: string; disabled?: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function post(action: 'sync' | 'disconnect') {
    setBusy(true);
    try {
      await apiFetch('/api/meta/wabas', { body: { action, wabaAccountId } });
      toast.success(action === 'sync' ? 'Synced with Meta.' : 'WhatsApp account disconnected.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Request failed.');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => void post('sync')} loading={busy} disabled={disabled}>
        {busy ? null : <RefreshCw />} Sync
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="Account actions" disabled={disabled}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuSeparator className="hidden" />
          <DropdownMenuItem destructive onSelect={() => setConfirm(true)}>
            <Unplug /> Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect this WhatsApp account?</AlertDialogTitle>
            <AlertDialogDescription>
              Talkzi stops receiving and sending messages for its numbers and deletes the stored access token.
              Conversation history is kept. You can reconnect anytime.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => void post('disconnect')}>
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
