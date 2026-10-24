'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal, RotateCw, Trash2, UserMinus } from 'lucide-react';
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
import { UserAvatar } from '@talkzi/ui/avatar';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@talkzi/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@talkzi/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@talkzi/ui/table';
import { hasMinRole, ROLE_META, WORKSPACE_ROLES, type WorkspaceRole } from '@talkzi/shared';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';

interface Member {
  userId: string;
  role: WorkspaceRole;
  joinedAt: string;
  name: string | null;
  email: string | null;
  avatarUrl: string | null;
}

export function MembersTable({
  members,
  currentUserId,
  currentRole,
}: {
  members: Member[];
  currentUserId: string;
  currentRole: WorkspaceRole;
}) {
  const router = useRouter();
  const [removing, setRemoving] = React.useState<Member | null>(null);
  const isAdmin = hasMinRole(currentRole, 'admin');

  async function changeRole(member: Member, role: WorkspaceRole) {
    try {
      await apiFetch(`/api/team/members/${member.userId}`, { method: 'PATCH', body: { role } });
      toast.success(`${member.name ?? member.email} is now ${ROLE_META[role].label}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not change role.');
    }
  }

  async function remove(member: Member) {
    try {
      await apiFetch(`/api/team/members/${member.userId}`, { method: 'DELETE' });
      toast.success(member.userId === currentUserId ? 'You left the workspace.' : 'Member removed.');
      router.refresh();
      if (member.userId === currentUserId) router.replace('/app');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not remove member.');
    } finally {
      setRemoving(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Members</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Member</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Joined</TableHead>
              <TableHead className="w-12 pr-5">
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {members.map((member) => {
              const isSelf = member.userId === currentUserId;
              const canEdit = isAdmin && !isSelf && (member.role !== 'owner' || currentRole === 'owner');
              return (
                <TableRow key={member.userId}>
                  <TableCell className="pl-5">
                    <div className="flex items-center gap-3">
                      <UserAvatar name={member.name ?? member.email} src={member.avatarUrl} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">
                          {member.name ?? 'Unnamed'} {isSelf ? <span className="text-xs text-muted-foreground">(you)</span> : null}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">{member.email}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {canEdit ? (
                      <Select value={member.role} onValueChange={(role) => void changeRole(member, role as WorkspaceRole)}>
                        <SelectTrigger className="h-8 w-32" aria-label={`Role for ${member.name ?? member.email}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {WORKSPACE_ROLES.filter((r) => r !== 'owner' || currentRole === 'owner').map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_META[role].label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>{ROLE_META[member.role].label}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{timeAgo(member.joinedAt)}</TableCell>
                  <TableCell className="pr-5">
                    {canEdit || isSelf ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label="Member actions">
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem destructive onSelect={() => setRemoving(member)}>
                            <UserMinus /> {isSelf ? 'Leave workspace' : 'Remove from workspace'}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{removing?.userId === currentUserId ? 'Leave this workspace?' : 'Remove member?'}</AlertDialogTitle>
            <AlertDialogDescription>
              {removing?.userId === currentUserId
                ? 'You will lose access to all conversations and settings in this workspace.'
                : `${removing?.name ?? removing?.email} will immediately lose access to this workspace.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction destructive onClick={() => removing && void remove(removing)}>
              {removing?.userId === currentUserId ? 'Leave' : 'Remove'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export function InvitationsTable({
  invitations,
}: {
  invitations: { id: string; email: string; role: WorkspaceRole; expires_at: string; created_at: string }[];
}) {
  const router = useRouter();

  async function resend(id: string) {
    try {
      const result = await apiFetch<{ inviteUrl: string; emailDelivered: boolean }>(`/api/invitations/${id}/resend`, {
        method: 'POST',
      });
      if (result.emailDelivered) toast.success('Invitation re-sent.');
      else {
        await navigator.clipboard.writeText(result.inviteUrl).catch(() => undefined);
        toast.info('New invite link copied to clipboard.');
      }
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not resend.');
    }
  }

  async function revoke(id: string) {
    try {
      await apiFetch(`/api/invitations/${id}`, { method: 'DELETE' });
      toast.success('Invitation revoked.');
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not revoke.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pending invitations</CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-5">Email</TableHead>
              <TableHead>Role</TableHead>
              <TableHead className="hidden sm:table-cell">Expires</TableHead>
              <TableHead className="pr-5 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="pl-5 font-medium">{inv.email}</TableCell>
                <TableCell>
                  <Badge variant="secondary">{ROLE_META[inv.role].label}</Badge>
                </TableCell>
                <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">{timeAgo(inv.expires_at)}</TableCell>
                <TableCell className="pr-5">
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="sm" onClick={() => void resend(inv.id)}>
                      <RotateCw /> Resend
                    </Button>
                    <Button variant="ghost" size="sm" className="text-danger" onClick={() => void revoke(inv.id)}>
                      <Trash2 /> Revoke
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
