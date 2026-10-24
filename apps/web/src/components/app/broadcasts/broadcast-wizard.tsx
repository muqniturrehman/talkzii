'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarClock, Send, Users } from 'lucide-react';
import {
  estimateCost,
  templateCategoryToPricing,
  USD_TO_PKR,
  type Audience,
  type VariableMapping,
  type VariableSource,
} from '@talkzi/shared';
import { summarizeTemplate } from '@talkzi/whatsapp/templates';
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { RadioGroup, RadioGroupItem } from '@talkzi/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { useLabels } from '@/components/app/inbox/use-inbox';
import { TemplatePreview } from '@/components/app/templates/template-preview';
import { useDebounced } from '@/hooks/use-debounced';
import { apiFetch } from '@/lib/api/client';
import { resolveTemplateValues } from '@/lib/broadcasts/variables';
import { broadcastsKey } from './broadcasts-list';

export interface WizardPhone {
  id: string;
  display_phone_number: string;
  verified_name: string | null;
  quality_rating: string | null;
}

export interface WizardTemplate {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
}

export interface WizardInitial {
  id: string;
  name: string;
  templateId: string | null;
  phoneNumberId: string | null;
  audience: Audience;
  variables: VariableMapping;
}

type Step = 'basics' | 'audience' | 'personalize' | 'review';
const STEPS: { id: Step; label: string }[] = [
  { id: 'basics', label: 'Message' },
  { id: 'audience', label: 'Audience' },
  { id: 'personalize', label: 'Personalise' },
  { id: 'review', label: 'Review' },
];

const SAMPLE_CONTACT = { name: 'Ayesha Khan', profile_name: null, wa_id: '923001234567', custom_fields: { city: 'Lahore' } };

function defaultMapping(template: WizardTemplate | undefined): VariableMapping {
  if (!template) return { header: [], body: [], buttons: {} };
  const summary = summarizeTemplate(template.components);
  const list = (Array.isArray(template.components) ? template.components : []) as { type?: string; example?: { body_text?: string[][] } }[];
  const examples = list.find((c) => c.type === 'BODY')?.example?.body_text?.[0] ?? [];
  return {
    header: summary.header.variables.map(() => ({ source: 'static', value: '' }) as VariableSource),
    body: summary.body.variables.map((_, i) =>
      i === 0 ? ({ source: 'contact.first_name', fallback: 'there' } as VariableSource) : ({ source: 'static', value: examples[i] ?? '' } as VariableSource),
    ),
    buttons: Object.fromEntries(summary.dynamicUrlButtons.map((index) => [String(index), { source: 'static', value: '' } as VariableSource])),
  };
}

function SourceEditor({ id, label, value, onChange }: { id: string; label: string; value: VariableSource; onChange: (v: VariableSource) => void }) {
  const setSource = (source: VariableSource['source']) => {
    switch (source) {
      case 'contact.name':
      case 'contact.first_name':
        return onChange({ source, fallback: 'there' });
      case 'contact.phone':
        return onChange({ source });
      case 'custom_field':
        return onChange({ source, key: '', fallback: '' });
      case 'static':
        return onChange({ source, value: '' });
    }
  };
  return (
    <div className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
      <Label htmlFor={id} className="font-mono text-xs sm:pb-2.5">
        {label}
      </Label>
      <Select value={value.source} onValueChange={(v) => setSource(v as VariableSource['source'])}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="contact.first_name">Contact first name</SelectItem>
          <SelectItem value="contact.name">Contact full name</SelectItem>
          <SelectItem value="contact.phone">Contact phone</SelectItem>
          <SelectItem value="custom_field">Custom field</SelectItem>
          <SelectItem value="static">Same text for everyone</SelectItem>
        </SelectContent>
      </Select>
      {value.source === 'static' ? (
        <Input aria-label={`${label} text`} value={value.value} placeholder="Text" onChange={(e) => onChange({ ...value, value: e.target.value })} />
      ) : value.source === 'custom_field' ? (
        <div className="grid grid-cols-2 gap-2">
          <Input aria-label={`${label} field`} value={value.key} placeholder="Field, e.g. city" onChange={(e) => onChange({ ...value, key: e.target.value })} />
          <Input aria-label={`${label} fallback`} value={value.fallback} placeholder="If empty" onChange={(e) => onChange({ ...value, fallback: e.target.value })} />
        </div>
      ) : value.source === 'contact.phone' ? (
        <span className="text-xs text-muted-foreground sm:pb-2.5">+92 300 1234567</span>
      ) : (
        <Input aria-label={`${label} fallback`} value={value.fallback} placeholder="If the name is unknown" onChange={(e) => onChange({ ...value, fallback: e.target.value })} />
      )}
    </div>
  );
}

export function BroadcastWizard({ phones, templates, initial }: { phones: WizardPhone[]; templates: WizardTemplate[]; initial?: WizardInitial }) {
  const { workspace } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const labels = useLabels();
  const [step, setStep] = React.useState<Step>('basics');
  const [id, setId] = React.useState(initial?.id ?? null);
  const [name, setName] = React.useState(initial?.name ?? '');
  const [templateId, setTemplateId] = React.useState(initial?.templateId ?? templates[0]?.id ?? '');
  const [phoneId, setPhoneId] = React.useState(initial?.phoneNumberId ?? phones[0]?.id ?? '');
  const [audience, setAudience] = React.useState<Audience>(initial?.audience ?? { type: 'all', excludeLabelIds: [] });
  const template = templates.find((t) => t.id === templateId);
  const [mapping, setMapping] = React.useState<VariableMapping>(() => initial?.variables ?? defaultMapping(template));
  const [when, setWhen] = React.useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = React.useState('');
  const [busy, setBusy] = React.useState<'draft' | 'launch' | null>(null);

  const summary = React.useMemo(() => (template ? summarizeTemplate(template.components) : null), [template]);
  const debouncedAudience = useDebounced(audience, 400);
  const audienceCount = useQuery({
    queryKey: ['broadcast-audience', debouncedAudience],
    queryFn: () => apiFetch<{ sendable: number; optedOut: number; total: number }>('/api/broadcasts/audience', { body: { audience: debouncedAudience } }),
    enabled: debouncedAudience.type !== 'labels' || debouncedAudience.labelIds.length > 0,
  });

  const previewValues = React.useMemo(() => resolveTemplateValues(mapping, SAMPLE_CONTACT), [mapping]);
  const sendable = audienceCount.data?.sendable ?? 0;
  const cost = template ? estimateCost(sendable, templateCategoryToPricing(template.category)) : 0;
  const needsMedia = summary ? ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(summary.header.format) : false;

  const basicsValid = name.trim().length > 0 && Boolean(template) && Boolean(phoneId);
  const audienceValid = audience.type !== 'labels' || audience.labelIds.length > 0;
  const mappingValid =
    mapping.body.every((s) => (s.source === 'static' ? s.value.trim() : s.source === 'custom_field' ? s.key.trim() : true)) &&
    mapping.header.every((s) => (s.source === 'static' ? s.value.trim() : true)) &&
    Object.values(mapping.buttons).every((s) => (s.source === 'static' ? s.value.trim() : true)) &&
    (!needsMedia || /^https:\/\//.test(mapping.headerMediaUrl ?? ''));

  const chooseTemplate = (nextId: string) => {
    setTemplateId(nextId);
    setMapping(defaultMapping(templates.find((t) => t.id === nextId)));
  };

  const toggleLabel = (key: 'labelIds' | 'excludeLabelIds', labelId: string) =>
    setAudience((a) => {
      if (a.type === 'contacts') return a;
      if (key === 'labelIds') {
        if (a.type !== 'labels') return a;
        const has = a.labelIds.includes(labelId);
        return { ...a, labelIds: has ? a.labelIds.filter((x) => x !== labelId) : [...a.labelIds, labelId] };
      }
      const has = a.excludeLabelIds.includes(labelId);
      return { ...a, excludeLabelIds: has ? a.excludeLabelIds.filter((x) => x !== labelId) : [...a.excludeLabelIds, labelId] };
    });

  const persist = async (): Promise<string> => {
    const body = { name: name.trim(), templateId, phoneNumberId: phoneId || undefined, audience, variables: mapping };
    if (id) {
      await apiFetch(`/api/broadcasts/${id}`, { method: 'PATCH', body });
      return id;
    }
    const created = await apiFetch<{ id: string }>('/api/broadcasts', { body });
    setId(created.id);
    return created.id;
  };

  const saveDraft = async () => {
    setBusy('draft');
    try {
      const savedId = await persist();
      void qc.invalidateQueries({ queryKey: broadcastsKey });
      toast.success('Draft saved.');
      router.push(`/app/broadcasts/${savedId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };

  const launch = async () => {
    if (when === 'later' && !scheduledLocal) {
      toast.error('Pick a date and time.');
      return;
    }
    setBusy('launch');
    try {
      const savedId = await persist();
      const result = await apiFetch<{ scheduledAt: string; recipients: { sendable: number } }>(`/api/broadcasts/${savedId}/launch`, {
        body: when === 'later' ? { scheduledAt: new Date(scheduledLocal).toISOString() } : {},
      });
      void qc.invalidateQueries({ queryKey: broadcastsKey });
      toast.success(
        when === 'later'
          ? `Scheduled for ${new Date(result.scheduledAt).toLocaleString()} · ${result.recipients.sendable.toLocaleString()} recipients`
          : `Sending to ${result.recipients.sendable.toLocaleString()} contacts — progress updates live.`,
      );
      router.push(`/app/broadcasts/${savedId}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not launch');
    } finally {
      setBusy(null);
    }
  };

  const stepIndex = STEPS.findIndex((s) => s.id === step);
  const canAdvance = step === 'basics' ? basicsValid : step === 'audience' ? audienceValid : step === 'personalize' ? mappingValid : true;

  if (templates.length === 0 || phones.length === 0) {
    return (
      <Alert variant="warning">
        <AlertDescription>
          {phones.length === 0 ? (
            <>
              Connect a WhatsApp number first. <Link className="underline" href="/app/sessions">WhatsApp numbers</Link>
            </>
          ) : (
            <>
              Broadcasts need an approved template. <Link className="underline" href="/app/templates/new">Create a template</Link>
            </>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Link href="/app/broadcasts" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Broadcasts
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">{initial ? 'Edit broadcast' : 'New broadcast'}</h1>

      <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              disabled={i > stepIndex && !canAdvance}
              onClick={() => (i <= stepIndex || canAdvance ? setStep(s.id) : undefined)}
              aria-current={step === s.id ? 'step' : undefined}
              className={cn('rounded-full border px-3 py-1', step === s.id ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
            >
              {i + 1}. {s.label}
            </button>
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          {step === 'basics' ? (
            <Card>
              <CardHeader>
                <CardTitle>Message</CardTitle>
                <CardDescription>Broadcasts send an approved template, so they work outside the 24-hour window.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bc-name">Broadcast name (internal)</Label>
                  <Input id="bc-name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Eid sale — VIP customers" />
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-template">Template</Label>
                    <Select value={templateId} onValueChange={chooseTemplate}>
                      <SelectTrigger id="bc-template">
                        <SelectValue placeholder="Choose a template" />
                      </SelectTrigger>
                      <SelectContent>
                        {templates.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name} ({t.language}) · {t.category.toLowerCase()}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-phone">Send from</Label>
                    <Select value={phoneId} onValueChange={setPhoneId}>
                      <SelectTrigger id="bc-phone">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {phones.map((p) => (
                          <SelectItem key={p.id} value={p.id} disabled={p.quality_rating === 'RED'}>
                            {p.display_phone_number} {p.verified_name ? `· ${p.verified_name}` : ''} {p.quality_rating === 'RED' ? '(quality RED)' : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 'audience' ? (
            <Card>
              <CardHeader>
                <CardTitle>Audience</CardTitle>
                <CardDescription>Opted-out contacts are always skipped.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <RadioGroup
                  value={audience.type}
                  onValueChange={(type) =>
                    setAudience((a) =>
                      type === 'labels'
                        ? { type: 'labels', labelIds: [], excludeLabelIds: a.type === 'contacts' ? [] : a.excludeLabelIds }
                        : { type: 'all', excludeLabelIds: a.type === 'contacts' ? [] : a.excludeLabelIds },
                    )
                  }
                  className="grid gap-3 sm:grid-cols-2"
                >
                  {(['all', 'labels'] as const).map((type) => (
                    <Label key={type} htmlFor={`aud-${type}`} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary">
                      <RadioGroupItem id={`aud-${type}`} value={type} className="mt-0.5" />
                      <span>
                        <span className="block font-medium">{type === 'all' ? 'All contacts' : 'Contacts with labels'}</span>
                        <span className="text-xs font-normal text-muted-foreground">
                          {type === 'all' ? 'Everyone who is subscribed.' : 'Target segments such as VIP or Wholesale.'}
                        </span>
                      </span>
                    </Label>
                  ))}
                </RadioGroup>

                {audience.type !== 'contacts' ? (
                  <>
                    {audience.type === 'labels' ? (
                      <div className="space-y-2">
                        <p className="text-sm font-medium">Include contacts with any of these labels</p>
                        <div className="flex flex-wrap gap-2">
                          {(labels.data ?? []).map((l) => {
                            const on = audience.labelIds.includes(l.id);
                            return (
                              <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleLabel('labelIds', l.id)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', on ? 'border-primary bg-primary/10' : 'border-border')}>
                                <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden /> {l.name}
                              </button>
                            );
                          })}
                          {(labels.data ?? []).length === 0 ? <span className="text-xs text-muted-foreground">No labels yet — create them on the Contacts page.</span> : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="space-y-2">
                      <p className="text-sm font-medium">Exclude contacts with these labels</p>
                      <div className="flex flex-wrap gap-2">
                        {(labels.data ?? []).map((l) => {
                          const on = audience.excludeLabelIds.includes(l.id);
                          return (
                            <button key={l.id} type="button" aria-pressed={on} onClick={() => toggleLabel('excludeLabelIds', l.id)} className={cn('inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs', on ? 'border-danger bg-danger/10' : 'border-border')}>
                              <span className="size-2 rounded-full" style={{ backgroundColor: l.color }} aria-hidden /> {l.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </>
                ) : null}

                <div className="flex items-center gap-3 rounded-xl bg-muted/50 p-3 text-sm" aria-live="polite">
                  <Users className="size-5 text-primary" />
                  {audienceCount.isFetching ? 'Counting…' : audienceCount.data ? (
                    <span>
                      <strong>{audienceCount.data.sendable.toLocaleString()}</strong> contacts will receive this
                      {audienceCount.data.optedOut ? ` · ${audienceCount.data.optedOut.toLocaleString()} opted out (skipped)` : ''}
                    </span>
                  ) : (
                    'Choose at least one label.'
                  )}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 'personalize' && summary ? (
            <Card>
              <CardHeader>
                <CardTitle>Personalise</CardTitle>
                <CardDescription>Fill each template variable from contact data or fixed text. Preview uses a sample contact.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {needsMedia ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="bc-media">Header {summary.header.format.toLowerCase()} URL (https)</Label>
                    <Input id="bc-media" type="url" value={mapping.headerMediaUrl ?? ''} onChange={(e) => setMapping((m) => ({ ...m, headerMediaUrl: e.target.value || undefined }))} placeholder="https://…" />
                  </div>
                ) : null}
                {mapping.header.map((source, i) => (
                  <SourceEditor key={`h${i}`} id={`h${i}`} label="Header {{1}}" value={source} onChange={(v) => setMapping((m) => ({ ...m, header: m.header.map((s, j) => (j === i ? v : s)) }))} />
                ))}
                {mapping.body.map((source, i) => (
                  <SourceEditor key={`b${i}`} id={`b${i}`} label={`Body {{${i + 1}}}`} value={source} onChange={(v) => setMapping((m) => ({ ...m, body: m.body.map((s, j) => (j === i ? v : s)) }))} />
                ))}
                {Object.entries(mapping.buttons).map(([index, source]) => (
                  <SourceEditor key={`btn${index}`} id={`btn${index}`} label={`Button ${Number(index) + 1} URL`} value={source} onChange={(v) => setMapping((m) => ({ ...m, buttons: { ...m.buttons, [index]: v } }))} />
                ))}
                {mapping.body.length + mapping.header.length + Object.keys(mapping.buttons).length === 0 && !needsMedia ? (
                  <p className="text-sm text-muted-foreground">This template has no variables — everyone gets the same message.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {step === 'review' ? (
            <Card>
              <CardHeader>
                <CardTitle>Review & send</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Broadcast</dt>
                    <dd className="font-medium">{name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Template</dt>
                    <dd className="font-medium">{template?.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Recipients</dt>
                    <dd className="font-medium">{sendable.toLocaleString()}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Estimated Meta cost</dt>
                    <dd className="font-medium">
                      ${cost.toFixed(2)} · Rs {Math.round(cost * USD_TO_PKR).toLocaleString()}
                      <span className="block text-xs font-normal text-muted-foreground">{template?.category.toLowerCase()} rate, billed by Meta</span>
                    </dd>
                  </div>
                </dl>
                <RadioGroup value={when} onValueChange={(v) => setWhen(v as 'now' | 'later')} className="grid gap-3 sm:grid-cols-2">
                  <Label htmlFor="when-now" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary">
                    <RadioGroupItem id="when-now" value="now" /> <Send className="size-4" /> Send now
                  </Label>
                  <Label htmlFor="when-later" className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 has-[:checked]:border-primary">
                    <RadioGroupItem id="when-later" value="later" /> <CalendarClock className="size-4" /> Schedule
                  </Label>
                </RadioGroup>
                {when === 'later' ? (
                  <div className="space-y-1.5">
                    <Label htmlFor="when-at">Send at ({workspace.timezone})</Label>
                    <Input id="when-at" type="datetime-local" value={scheduledLocal} onChange={(e) => setScheduledLocal(e.target.value)} className="w-64" />
                  </div>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  Messages go out in batches within your number’s daily messaging limit. Sending pauses automatically if the number’s quality drops to RED.
                </p>
              </CardContent>
            </Card>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2">
            <Button variant="ghost" disabled={stepIndex === 0} onClick={() => setStep(STEPS[Math.max(0, stepIndex - 1)]!.id)}>
              Back
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void saveDraft()} loading={busy === 'draft'} disabled={!basicsValid || busy !== null}>
                Save draft
              </Button>
              {step === 'review' ? (
                <Button onClick={() => void launch()} loading={busy === 'launch'} disabled={busy !== null || !basicsValid || !audienceValid || !mappingValid || sendable === 0}>
                  {when === 'later' ? 'Schedule broadcast' : `Send to ${sendable.toLocaleString()}`}
                </Button>
              ) : (
                <Button disabled={!canAdvance} onClick={() => setStep(STEPS[stepIndex + 1]!.id)}>
                  Continue
                </Button>
              )}
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-20 lg:self-start">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Preview · sample contact</p>
          {template ? (
            <TemplatePreview components={template.components} values={{ header: previewValues.header, body: previewValues.body }} mediaUrl={mapping.headerMediaUrl} businessName={workspace.name} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
