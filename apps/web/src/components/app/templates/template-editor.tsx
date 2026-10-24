'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Braces, Copy, ExternalLink, Phone, Plus, Reply, Trash2, Upload } from 'lucide-react';
import {
  draftToComponents,
  TEMPLATE_CATEGORIES,
  TEMPLATE_CATEGORY_META,
  TEMPLATE_LANGUAGES,
  templateDraftSchema,
  toTemplateName,
  type TemplateButtonDraft,
  type TemplateCategoryId,
  type TemplateDraft,
  type TemplateDraftInput,
  type TemplateHeaderDraft,
} from '@talkzi/shared';
import { extractVariables } from '@talkzi/whatsapp/templates';
import { Alert, AlertDescription, AlertTitle } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@talkzi/ui/card';
import { Checkbox } from '@talkzi/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@talkzi/ui/dropdown-menu';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Textarea } from '@talkzi/ui/textarea';
import { toast } from '@talkzi/ui/sonner';
import { cn } from '@talkzi/ui/lib/utils';
import { useApp } from '@/components/providers/app-providers';
import { apiFetch } from '@/lib/api/client';
import { safeFileName } from '@/lib/inbox/media';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { TemplatePreview } from './template-preview';
import { templatesKey } from './templates-list';

type Step = 'category' | 'details' | 'content';

interface EditorState {
  name: string;
  category: TemplateCategoryId;
  language: string;
  header: TemplateHeaderDraft & { previewUrl?: string };
  body: { text: string; examples: string[] };
  footer: string;
  buttons: TemplateButtonDraft[];
  auth: { addSecurityRecommendation: boolean; codeExpirationMinutes?: number; buttonText: string };
}

const HEADER_TYPES: TemplateHeaderDraft['type'][] = ['NONE', 'TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT'];
const MEDIA_ACCEPT: Record<string, string> = { IMAGE: 'image/jpeg,image/png', VIDEO: 'video/mp4', DOCUMENT: 'application/pdf' };

function fromInput(initial?: TemplateDraftInput): EditorState {
  return {
    name: initial?.name ?? '',
    category: initial?.category ?? 'UTILITY',
    language: initial?.language ?? 'en',
    header: (initial?.header as EditorState['header']) ?? { type: 'NONE' },
    body: { text: initial?.body?.text ?? '', examples: initial?.body?.examples ?? [] },
    footer: initial?.footer ?? '',
    buttons: initial?.buttons ?? [],
    auth: { addSecurityRecommendation: true, buttonText: 'Copy code', ...initial?.auth },
  };
}

function toInput(state: EditorState): TemplateDraftInput {
  return {
    name: state.name,
    category: state.category,
    language: state.language,
    header: state.header.type === 'TEXT' ? { type: 'TEXT', text: state.header.text, example: state.header.example || undefined } : state.header,
    body: state.body,
    footer: state.footer.trim() || undefined,
    buttons: state.buttons,
    auth: state.category === 'AUTHENTICATION' ? state.auth : undefined,
  };
}

function FieldError({ errors, path }: { errors: Map<string, string>; path: string }) {
  const message = errors.get(path);
  return message ? <p className="text-xs text-danger">{message}</p> : null;
}

export function TemplateEditor({
  mode,
  templateId,
  initial,
  status,
  rejectedReason,
}: {
  mode: 'create' | 'edit';
  templateId?: string;
  initial?: TemplateDraftInput;
  status?: string;
  rejectedReason?: string | null;
}) {
  const { workspace } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const [step, setStep] = React.useState<Step>(mode === 'edit' ? 'content' : 'category');
  const [state, setState] = React.useState<EditorState>(() => fromInput(initial));
  const [saving, setSaving] = React.useState<'draft' | 'submit' | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [showErrors, setShowErrors] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const submitted = Boolean(status && status !== 'DRAFT');

  const parsed = React.useMemo(() => templateDraftSchema.safeParse(toInput(state)), [state]);
  const errors = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const issue of parsed.error?.issues ?? []) {
      const key = issue.path.join('.');
      if (!map.has(key)) map.set(key, issue.message);
    }
    return map;
  }, [parsed]);
  const shownErrors = showErrors ? errors : new Map<string, string>();
  const components = React.useMemo(() => draftToComponents((parsed.success ? parsed.data : toInput(state)) as TemplateDraft), [parsed, state]);
  const variables = extractVariables(state.body.text);

  const update = (patch: Partial<EditorState>) => setState((s) => ({ ...s, ...patch }));

  const insertVariable = () => {
    const next = (variables.at(-1) ?? 0) + 1;
    const el = bodyRef.current;
    const token = `{{${next}}}`;
    const text = state.body.text;
    const pos = el ? el.selectionStart : text.length;
    const before = text.slice(0, pos);
    const spacer = before && !/\s$/.test(before) ? ' ' : '';
    const value = `${before}${spacer}${token}${text.slice(pos)}`;
    update({ body: { text: value.slice(0, 1024), examples: [...state.body.examples, ''] } });
    requestAnimationFrame(() => {
      el?.focus();
      const caret = pos + spacer.length + token.length;
      el?.setSelectionRange(caret, caret);
    });
  };

  const addButton = (type: TemplateButtonDraft['type']) => {
    const button: TemplateButtonDraft =
      type === 'QUICK_REPLY'
        ? { type, text: '' }
        : type === 'URL'
          ? { type, text: 'Visit website', url: 'https://' }
          : type === 'PHONE_NUMBER'
            ? { type, text: 'Call us', phone: '+92' }
            : { type, example: 'SAVE20' };
    update({ buttons: [...state.buttons, button] });
  };
  const updateButton = (index: number, patch: Partial<TemplateButtonDraft>) =>
    update({ buttons: state.buttons.map((b, i) => (i === index ? ({ ...b, ...patch } as TemplateButtonDraft) : b)) });

  const uploadSample = async (file: File) => {
    setUploading(true);
    try {
      const path = `${workspace.id}/templates/${crypto.randomUUID()}-${safeFileName(file.name)}`;
      const { error } = await getSupabaseBrowserClient().storage.from('media').upload(path, file, { contentType: file.type });
      if (error) throw new Error(error.message);
      const result = await apiFetch<{ handle: string; previewUrl: string | null }>('/api/templates/media', {
        body: { storagePath: path, mimeType: file.type, filename: file.name },
      });
      update({ header: { ...state.header, type: state.header.type, handle: result.handle, previewUrl: result.previewUrl ?? undefined } as EditorState['header'] });
      toast.success('Sample uploaded.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const save = async (submit: boolean) => {
    setShowErrors(true);
    if (!parsed.success) {
      toast.error('Fix the highlighted fields first.');
      return;
    }
    setSaving(submit ? 'submit' : 'draft');
    try {
      let id = templateId;
      if (mode === 'create') {
        const created = await apiFetch<{ id: string; status: string }>('/api/templates', { body: { draft: parsed.data, submit } });
        id = created.id;
        toast.success(submit ? (created.status === 'APPROVED' ? 'Template approved instantly.' : 'Submitted to Meta for review.') : 'Draft saved.');
      } else {
        await apiFetch(`/api/templates/${templateId}`, { method: 'PATCH', body: parsed.data });
        if (submit) {
          const result = await apiFetch<{ status: string }>(`/api/templates/${templateId}/submit`, { method: 'POST' });
          toast.success(result.status === 'APPROVED' ? 'Template approved.' : 'Submitted to Meta for review.');
        } else {
          toast.success('Changes saved.');
        }
      }
      void qc.invalidateQueries({ queryKey: templatesKey });
      router.push(`/app/templates/${id}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not save the template');
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-6">
      <Link href="/app/templates" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Templates
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{mode === 'create' ? 'New template' : state.name}</h1>
          <p className="text-sm text-muted-foreground">
            {mode === 'create' ? 'Templates are reviewed by Meta, usually within minutes.' : `${state.category.toLowerCase()} · ${state.language}`}
          </p>
        </div>
        {status ? <Badge variant={status === 'REJECTED' ? 'danger' : 'secondary'}>{status.toLowerCase()}</Badge> : null}
      </div>

      {status === 'REJECTED' ? (
        <Alert variant="danger">
          <AlertTitle>Rejected by Meta{rejectedReason ? `: ${rejectedReason.replaceAll('_', ' ').toLowerCase()}` : ''}</AlertTitle>
          <AlertDescription>
            Edit the content and resubmit. Common fixes: pick the right category, add clear sample values, and avoid placing variables at the start or end.
          </AlertDescription>
        </Alert>
      ) : null}

      {mode === 'create' ? (
        <ol className="flex flex-wrap gap-2 text-xs" aria-label="Steps">
          {(['category', 'details', 'content'] as const).map((s, i) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => (s === 'content' && !state.name ? setStep('details') : setStep(s))}
                aria-current={step === s ? 'step' : undefined}
                className={cn('rounded-full border px-3 py-1', step === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground')}
              >
                {i + 1}. {s === 'category' ? 'Category' : s === 'details' ? 'Name & language' : 'Content'}
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {step === 'category' ? (
        <div className="grid gap-4 md:grid-cols-3">
          {TEMPLATE_CATEGORIES.map((category) => (
            <button
              key={category}
              type="button"
              onClick={() => {
                update({ category });
                setStep('details');
              }}
              className={cn(
                'rounded-2xl border p-5 text-left transition hover:border-primary/60 hover:shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                state.category === category ? 'border-primary bg-primary/5' : 'border-border bg-card',
              )}
            >
              <span className="text-base font-semibold">{TEMPLATE_CATEGORY_META[category].label}</span>
              <span className="mt-1 block text-sm text-muted-foreground">{TEMPLATE_CATEGORY_META[category].description}</span>
              <span className="mt-3 block text-xs text-muted-foreground">e.g. {TEMPLATE_CATEGORY_META[category].examples}</span>
            </button>
          ))}
        </div>
      ) : null}

      {step === 'details' ? (
        <Card className="max-w-xl">
          <CardHeader>
            <CardTitle>Name & language</CardTitle>
            <CardDescription>Names are lowercase with underscores. Create one template per language.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input
                id="tpl-name"
                value={state.name}
                disabled={submitted}
                placeholder="order_update"
                onChange={(e) => update({ name: e.target.value.toLowerCase().replace(/[\s-]+/g, '_') })}
                onBlur={() => update({ name: toTemplateName(state.name) })}
              />
              <FieldError errors={shownErrors} path="name" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-lang">Language</Label>
              <Select value={state.language} onValueChange={(language) => update({ language })} disabled={submitted}>
                <SelectTrigger id="tpl-lang">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>
                      {l.label} ({l.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-between">
              {mode === 'create' ? (
                <Button variant="ghost" onClick={() => setStep('category')}>
                  Back
                </Button>
              ) : (
                <span />
              )}
              <Button disabled={!state.name || errors.has('name')} onClick={() => setStep('content')}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {step === 'content' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="space-y-6">
            {state.category === 'AUTHENTICATION' ? (
              <Card>
                <CardHeader>
                  <CardTitle>Authentication options</CardTitle>
                  <CardDescription>Meta writes the message: “123456 is your verification code.” You choose the extras.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={state.auth.addSecurityRecommendation}
                      onCheckedChange={(v) => update({ auth: { ...state.auth, addSecurityRecommendation: v === true } })}
                    />
                    Add “For your security, do not share this code.”
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-exp">Code expires after (minutes)</Label>
                      <Input
                        id="auth-exp"
                        type="number"
                        min={1}
                        max={90}
                        value={state.auth.codeExpirationMinutes ?? ''}
                        onChange={(e) => update({ auth: { ...state.auth, codeExpirationMinutes: e.target.value ? Number(e.target.value) : undefined } })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="auth-btn">Button text</Label>
                      <Input id="auth-btn" maxLength={25} value={state.auth.buttonText} onChange={(e) => update({ auth: { ...state.auth, buttonText: e.target.value } })} />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle>Header</CardTitle>
                    <CardDescription>Optional. Media headers make offers and receipts stand out.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Header type">
                      {HEADER_TYPES.map((type) => (
                        <button
                          key={type}
                          type="button"
                          role="radio"
                          aria-checked={state.header.type === type}
                          onClick={() =>
                            update({
                              header: type === 'TEXT' ? { type, text: '' } : type === 'NONE' ? { type } : { type },
                            })
                          }
                          className={cn(
                            'rounded-lg border px-3 py-1.5 text-xs font-medium',
                            state.header.type === type ? 'border-primary bg-primary/10 text-primary dark:text-accent' : 'border-border text-muted-foreground',
                          )}
                        >
                          {type === 'NONE' ? 'None' : type[0] + type.slice(1).toLowerCase()}
                        </button>
                      ))}
                    </div>
                    {state.header.type === 'TEXT' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label htmlFor="hdr-text">Header text</Label>
                          <Input
                            id="hdr-text"
                            maxLength={60}
                            value={state.header.text}
                            onChange={(e) => update({ header: { ...state.header, type: 'TEXT', text: e.target.value } as EditorState['header'] })}
                          />
                          <FieldError errors={shownErrors} path="header.text" />
                        </div>
                        {extractVariables(state.header.text).length ? (
                          <div className="space-y-1.5">
                            <Label htmlFor="hdr-example">Sample for {'{{1}}'}</Label>
                            <Input
                              id="hdr-example"
                              maxLength={60}
                              value={state.header.example ?? ''}
                              onChange={(e) => update({ header: { ...state.header, type: 'TEXT', example: e.target.value } as EditorState['header'] })}
                            />
                            <FieldError errors={shownErrors} path="header.example" />
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                    {state.header.type === 'IMAGE' || state.header.type === 'VIDEO' || state.header.type === 'DOCUMENT' ? (
                      <div className="flex flex-wrap items-center gap-3">
                        <Button asChild variant="outline" size="sm" loading={uploading}>
                          <label className="cursor-pointer">
                            <Upload /> Upload sample
                            <input
                              type="file"
                              className="sr-only"
                              accept={MEDIA_ACCEPT[state.header.type]}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void uploadSample(file);
                              }}
                            />
                          </label>
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {state.header.handle ? 'Sample attached ✓' : 'Meta needs a sample file to review media headers.'}
                        </span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle>Body</CardTitle>
                      <CardDescription>Use *bold*, _italic_ and variables like {'{{1}}'} for names or order numbers.</CardDescription>
                    </div>
                    <Button size="sm" variant="outline" onClick={insertVariable} disabled={variables.length >= 20}>
                      <Braces /> Add variable
                    </Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Textarea
                      ref={bodyRef}
                      rows={6}
                      maxLength={1024}
                      value={state.body.text}
                      onChange={(e) => {
                        const text = e.target.value;
                        const count = extractVariables(text).length;
                        update({ body: { text, examples: Array.from({ length: count }, (_, i) => state.body.examples[i] ?? '') } });
                      }}
                      placeholder="Hi {{1}}, your order {{2}} has been dispatched and will arrive in 2–3 days."
                      aria-label="Template body"
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <FieldError errors={shownErrors} path="body.text" />
                      <span className="ml-auto">{state.body.text.length}/1024</span>
                    </div>
                    {variables.length ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {variables.map((n, i) => (
                          <div key={n} className="space-y-1.5">
                            <Label htmlFor={`ex-${n}`}>Sample for {`{{${n}}}`}</Label>
                            <Input
                              id={`ex-${n}`}
                              value={state.body.examples[i] ?? ''}
                              maxLength={200}
                              onChange={(e) => update({ body: { ...state.body, examples: state.body.examples.map((v, j) => (j === i ? e.target.value : v)) } })}
                            />
                            <FieldError errors={shownErrors} path={`body.examples.${i}`} />
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Footer & buttons</CardTitle>
                    <CardDescription>Optional. Up to 10 buttons: quick replies, 2 website links, 1 call button and 1 copy-code button.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="footer">Footer</Label>
                      <Input id="footer" maxLength={60} value={state.footer} onChange={(e) => update({ footer: e.target.value })} placeholder="Reply STOP to unsubscribe" />
                    </div>
                    <ul className="space-y-3">
                      {state.buttons.map((button, i) => (
                        <li key={i} className="space-y-2 rounded-xl border border-border p-3">
                          <div className="flex items-center justify-between">
                            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                              {button.type === 'QUICK_REPLY' ? <Reply className="size-3.5" /> : button.type === 'URL' ? <ExternalLink className="size-3.5" /> : button.type === 'PHONE_NUMBER' ? <Phone className="size-3.5" /> : <Copy className="size-3.5" />}
                              {button.type === 'QUICK_REPLY' ? 'Quick reply' : button.type === 'URL' ? 'Website' : button.type === 'PHONE_NUMBER' ? 'Call' : 'Copy code'}
                            </span>
                            <Button size="icon-sm" variant="ghost" aria-label="Remove button" onClick={() => update({ buttons: state.buttons.filter((_, j) => j !== i) })}>
                              <Trash2 />
                            </Button>
                          </div>
                          <div className="grid gap-2 sm:grid-cols-2">
                            {'text' in button ? (
                              <Input aria-label="Button text" maxLength={25} value={button.text} placeholder="Button text" onChange={(e) => updateButton(i, { text: e.target.value })} />
                            ) : null}
                            {button.type === 'URL' ? (
                              <Input aria-label="Website URL" value={button.url} placeholder="https://shop.pk/track/{{1}}" onChange={(e) => updateButton(i, { url: e.target.value })} />
                            ) : null}
                            {button.type === 'URL' && extractVariables(button.url).length ? (
                              <Input aria-label="Example URL" className="sm:col-span-2" value={button.example ?? ''} placeholder="https://shop.pk/track/1042" onChange={(e) => updateButton(i, { example: e.target.value })} />
                            ) : null}
                            {button.type === 'PHONE_NUMBER' ? (
                              <Input aria-label="Phone number" value={button.phone} onChange={(e) => updateButton(i, { phone: e.target.value })} />
                            ) : null}
                            {button.type === 'COPY_CODE' ? (
                              <Input aria-label="Example code" maxLength={15} value={button.example} onChange={(e) => updateButton(i, { example: e.target.value })} />
                            ) : null}
                          </div>
                          {[...shownErrors.entries()].filter(([k]) => k.startsWith(`buttons.${i}.`)).map(([k, m]) => (
                            <p key={k} className="text-xs text-danger">
                              {m}
                            </p>
                          ))}
                        </li>
                      ))}
                    </ul>
                    <FieldError errors={shownErrors} path="buttons" />
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" disabled={state.buttons.length >= 10}>
                          <Plus /> Add button
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem onSelect={() => addButton('QUICK_REPLY')}>
                          <Reply /> Quick reply
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => addButton('URL')}>
                          <ExternalLink /> Visit website
                        </DropdownMenuItem>
                        <DropdownMenuItem onSelect={() => addButton('PHONE_NUMBER')}>
                          <Phone /> Call phone number
                        </DropdownMenuItem>
                        {state.category === 'MARKETING' ? (
                          <DropdownMenuItem onSelect={() => addButton('COPY_CODE')}>
                            <Copy /> Copy offer code
                          </DropdownMenuItem>
                        ) : null}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </CardContent>
                </Card>
              </>
            )}

            <div className="flex flex-wrap justify-between gap-2">
              {mode === 'create' ? (
                <Button variant="ghost" onClick={() => setStep('details')}>
                  Back
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => setStep('details')} disabled={submitted}>
                  Name & language
                </Button>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => void save(false)} loading={saving === 'draft'} disabled={saving !== null}>
                  Save draft
                </Button>
                <Button onClick={() => void save(true)} loading={saving === 'submit'} disabled={saving !== null}>
                  {status === 'REJECTED' ? 'Resubmit for review' : 'Submit for review'}
                </Button>
              </div>
            </div>
          </div>

          <div className="lg:sticky lg:top-20 lg:self-start">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">Live preview</p>
            <TemplatePreview components={components} mediaUrl={state.header.type !== 'NONE' && 'previewUrl' in state.header ? state.header.previewUrl : null} businessName={workspace.name} />
            {showErrors && errors.size ? (
              <p className="mt-3 text-xs text-danger" role="alert">
                {errors.size} issue{errors.size === 1 ? '' : 's'} to fix before saving.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
