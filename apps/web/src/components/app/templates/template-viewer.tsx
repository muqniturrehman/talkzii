'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CopyPlus, Lock, Trash2 } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@talkzi/ui/alert-dialog';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@talkzi/ui/card';
import { toast } from '@talkzi/ui/sonner';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import { TEMPLATE_STATUS_VARIANT, TemplatePreview } from './template-preview';
import { templatesKey } from './templates-list';

export interface TemplateViewModel {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  components: unknown;
  rejected_reason: string | null;
  quality_score: string | null;
  submitted_at: string | null;
  approved_at: string | null;
  meta_template_id: string | null;
}

export function TemplateViewer({ template }: { template: TemplateViewModel }) {
  const { can, workspace } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState<'duplicate' | 'delete' | null>(null);

  const duplicate = async () => {
    setBusy('duplicate');
    try {
      const copy = await apiFetch<{ id: string }>(`/api/templates/${template.id}/duplicate`, { method: 'POST' });
      void qc.invalidateQueries({ queryKey: templatesKey });
      router.push(`/app/templates/${copy.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not duplicate');
      setBusy(null);
    }
  };
  const remove = async () => {
    setBusy('delete');
    try {
      await apiFetch(`/api/templates/${template.id}`, { method: 'DELETE' });
      void qc.invalidateQueries({ queryKey: templatesKey });
      toast.success('Template deleted.');
      router.push('/app/templates');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not delete');
      setBusy(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/app/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Templates
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{template.name}</h1>
          <p className="text-sm text-muted-foreground">
            {template.category.toLowerCase()} · {template.language}
            {template.meta_template_id ? ` · Meta ID ${template.meta_template_id}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={TEMPLATE_STATUS_VARIANT[template.status] ?? 'secondary'}>{template.status.toLowerCase()}</Badge>
          {can('admin') ? (
            <>
              <Button variant="outline" onClick={() => void duplicate()} loading={busy === 'duplicate'}>
                <CopyPlus /> Duplicate
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" aria-label="Delete template">
                    <Trash2 />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {template.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      It is removed from your WhatsApp account too, and Meta won’t let you reuse this name for 30 days. Scheduled broadcasts using it will fail.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction destructive onClick={() => void remove()}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : null}
        </div>
      </div>

      <Alert variant={template.status === 'APPROVED' ? 'success' : 'info'}>
        <Lock />
        <AlertTitle>
          {template.status === 'APPROVED' ? 'Approved — ready to send' : template.status === 'PENDING' || template.status === 'IN_APPEAL' ? 'In review with Meta' : `Status: ${template.status.toLowerCase()}`}
        </AlertTitle>
        <AlertDescription>
          {template.status === 'APPROVED'
            ? 'Approved templates are locked so what you send always matches what Meta approved. Duplicate it to make changes.'
            : template.status === 'PENDING' || template.status === 'IN_APPEAL'
              ? 'You’ll see the result here automatically once Meta finishes reviewing — usually within minutes, at most 24 hours.'
              : 'This template cannot be sent right now. Duplicate it to create a new version.'}
        </AlertDescription>
      </Alert>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="text-muted-foreground">Submitted:</span> {template.submitted_at ? new Date(template.submitted_at).toLocaleString() : 'Not yet'}
            </p>
            <p>
              <span className="text-muted-foreground">Approved:</span> {template.approved_at ? new Date(template.approved_at).toLocaleString() : '—'}
            </p>
            <p>
              <span className="text-muted-foreground">Quality:</span> {template.quality_score ? template.quality_score.toLowerCase() : 'unknown'}
            </p>
            {template.rejected_reason ? (
              <p>
                <span className="text-muted-foreground">Rejection reason:</span> {template.rejected_reason.replaceAll('_', ' ').toLowerCase()}
              </p>
            ) : null}
          </CardContent>
        </Card>
        <TemplatePreview components={template.components} businessName={workspace.name} />
      </div>
    </div>
  );
}
