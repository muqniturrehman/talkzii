'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, X } from 'lucide-react';
import { CONDITION_OPERATORS, type ChatbotNodeType, type ChatbotTrigger } from '@talkzi/shared';
import { Button } from '@talkzi/ui/button';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Textarea } from '@talkzi/ui/textarea';
import { summarizeTemplate } from '@talkzi/whatsapp/templates';
import { useLabels, useMembers } from '@/components/app/inbox/use-inbox';
import { apiFetch } from '@/lib/api/client';
import { NODE_META, type FlowNodeData } from './flow-nodes';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const slug = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || `opt_${Math.random().toString(36).slice(2, 6)}`;

const VARIABLE_HINT = 'Use {{contact.first_name}}, {{contact.phone}}, {{contact.custom.city}} or {{vars.name}}.';

interface ApprovedTemplate {
  id: string;
  name: string;
  language: string;
  components: unknown;
}

/** Flow template steps fill body variables only, so templates needing header media/text or URL suffixes are left out. */
function bodyOnly(template: ApprovedTemplate): number | null {
  const summary = summarizeTemplate(template.components);
  if (summary.header.format !== 'NONE' && summary.header.format !== 'TEXT') return null;
  if (summary.header.variables.length > 0 || summary.dynamicUrlButtons.length > 0) return null;
  return summary.body.variables.length;
}

function TemplateStep({ data, set }: { data: FlowNodeData; set: (patch: FlowNodeData) => void }) {
  const templates = useQuery({ queryKey: ['templates', 'approved'], queryFn: () => apiFetch<ApprovedTemplate[]>('/api/templates?status=APPROVED') });
  const usable = (templates.data ?? []).flatMap((t) => {
    const count = bodyOnly(t);
    return count === null ? [] : [{ ...t, count }];
  });
  const variables = Array.isArray(data.variables) ? (data.variables as string[]) : [];
  return (
    <>
      <Field id="n-template" label="Approved template" hint="Templates can be sent even after the 24-hour window has closed.">
        <Select
          value={str(data.templateId)}
          onValueChange={(templateId) => {
            const template = usable.find((t) => t.id === templateId);
            set({ templateId, templateName: template ? `${template.name} · ${template.language}` : undefined, variables: Array.from({ length: template?.count ?? 0 }, (_, i) => variables[i] ?? '') });
          }}
        >
          <SelectTrigger id="n-template">
            <SelectValue placeholder={templates.isLoading ? 'Loading…' : usable.length ? 'Choose a template' : 'No approved templates yet'} />
          </SelectTrigger>
          <SelectContent>
            {usable.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} · {t.language}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      {variables.map((value, i) => (
        <Field key={i} id={`n-tvar-${i}`} label={`{{${i + 1}}}`} hint={i === 0 ? VARIABLE_HINT : undefined}>
          <Input id={`n-tvar-${i}`} value={value} onChange={(e) => set({ variables: variables.map((v, j) => (j === i ? e.target.value : v)) })} />
        </Field>
      ))}
    </>
  );
}

function HttpStep({ data, set }: { data: FlowNodeData; set: (patch: FlowNodeData) => void }) {
  const headers = Array.isArray(data.headers) ? (data.headers as { key: string; value: string }[]) : [];
  const method = str(data.method) || 'POST';
  return (
    <>
      <div className="grid grid-cols-[96px_1fr] gap-2">
        <Field id="n-method" label="Method">
          <Select value={method} onValueChange={(m) => set({ method: m })}>
            <SelectTrigger id="n-method">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field id="n-url" label="URL">
          <Input id="n-url" value={str(data.url)} onChange={(e) => set({ url: e.target.value.trim() })} placeholder="https://api.yourshop.com/orders/{{vars.order_id}}" />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground">Public https URLs only. Values inserted into the URL are URL-encoded; the request times out after 8 seconds.</p>
      <div className="space-y-2">
        <Label>Headers</Label>
        {headers.map((h, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
            <Input aria-label={`Header ${i + 1} name`} value={h.key} placeholder="Authorization" onChange={(e) => set({ headers: headers.map((x, j) => (j === i ? { ...x, key: e.target.value.replace(/[^A-Za-z0-9-]/g, '') } : x)) })} />
            <Input aria-label={`Header ${i + 1} value`} value={h.value} placeholder="Bearer …" onChange={(e) => set({ headers: headers.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} />
            <Button type="button" size="icon" variant="ghost" aria-label="Remove header" onClick={() => set({ headers: headers.filter((_, j) => j !== i) })}>
              <X />
            </Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="outline" disabled={headers.length >= 10} onClick={() => set({ headers: [...headers, { key: '', value: '' }] })}>
          <Plus /> Add header
        </Button>
      </div>
      {method === 'POST' ? (
        <Field id="n-body" label="JSON body" hint="Values are JSON-escaped, e.g. {&quot;phone&quot;: &quot;{{contact.phone}}&quot;}.">
          <Textarea id="n-body" rows={5} className="font-mono text-xs" value={str(data.body)} onChange={(e) => set({ body: e.target.value || undefined })} />
        </Field>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field id="n-save" label="Save response as" hint="Then use {{vars.<name>}}.">
          <Input id="n-save" value={str(data.saveAs)} onChange={(e) => set({ saveAs: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') || undefined })} />
        </Field>
        <Field id="n-path" label="JSON field (optional)" hint="e.g. order.status">
          <Input id="n-path" value={str(data.responsePath)} onChange={(e) => set({ responsePath: e.target.value || undefined })} />
        </Field>
      </div>
      <p className="text-[11px] text-muted-foreground">2xx responses follow Success; anything else (or a timeout) follows Error, or Success if Error isn’t connected. The status code is saved as {'{{vars.http_status}}'}.</p>
    </>
  );
}

function Field({ id, label, children, hint }: { id: string; label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function TriggerEditor({ trigger, onChange }: { trigger: ChatbotTrigger; onChange: (t: ChatbotTrigger) => void }) {
  const [draft, setDraft] = React.useState('');
  const addKeyword = () => {
    const words = draft.split(',').map((w) => w.trim()).filter(Boolean);
    if (words.length) onChange({ ...trigger, keywords: [...new Set([...trigger.keywords, ...words])].slice(0, 30) });
    setDraft('');
  };
  return (
    <div className="space-y-4">
      <Field id="trigger-type" label="Start this flow when">
        <Select value={trigger.type} onValueChange={(type) => onChange({ ...trigger, type: type as ChatbotTrigger['type'] })}>
          <SelectTrigger id="trigger-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="keyword">A customer sends a keyword</SelectItem>
            <SelectItem value="first_message">A new customer messages for the first time</SelectItem>
            <SelectItem value="any_message">Any message (when no other flow matches)</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {trigger.type === 'keyword' ? (
        <>
          <Field id="trigger-match" label="Matching">
            <Select value={trigger.match} onValueChange={(match) => onChange({ ...trigger, match: match as ChatbotTrigger['match'] })}>
              <SelectTrigger id="trigger-match">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="exact">Message is exactly the keyword</SelectItem>
                <SelectItem value="contains">Message contains the keyword</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field id="trigger-keywords" label="Keywords" hint="Not case-sensitive. Separate with commas.">
            <div className="flex gap-2">
              <Input
                id="trigger-keywords"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addKeyword();
                  }
                }}
                placeholder="hi, menu, salam"
              />
              <Button type="button" variant="outline" size="icon" onClick={addKeyword} aria-label="Add keyword">
                <Plus />
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {trigger.keywords.map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full border border-border py-0.5 pl-2 pr-1 text-xs">
                  {k}
                  <button type="button" onClick={() => onChange({ ...trigger, keywords: trigger.keywords.filter((x) => x !== k) })} className="rounded-full p-0.5 hover:bg-muted" aria-label={`Remove ${k}`}>
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          </Field>
        </>
      ) : null}
    </div>
  );
}

export function NodeInspector({
  type,
  data,
  onChange,
  onDelete,
}: {
  type: ChatbotNodeType;
  data: FlowNodeData;
  onChange: (data: FlowNodeData) => void;
  onDelete?: () => void;
}) {
  const labels = useLabels();
  const members = useMembers();
  const set = (patch: FlowNodeData) => onChange({ ...data, ...patch });
  const options = Array.isArray(data.options) ? (data.options as { id: string; title: string }[]) : [];
  const buttons = Array.isArray(data.buttons) ? (data.buttons as { id: string; title: string }[]) : [];

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold">{NODE_META[type].label}</p>
        <p className="text-xs text-muted-foreground">{NODE_META[type].description}</p>
      </div>

      {type === 'message' ? (
        <Field id="n-text" label="Message" hint={VARIABLE_HINT}>
          <Textarea id="n-text" rows={5} maxLength={4096} value={str(data.text)} onChange={(e) => set({ text: e.target.value })} />
        </Field>
      ) : null}

      {type === 'ask' ? (
        <>
          <Field id="n-question" label="Question" hint={VARIABLE_HINT}>
            <Textarea id="n-question" rows={3} maxLength={1024} value={str(data.question)} onChange={(e) => set({ question: e.target.value })} />
          </Field>
          <Field id="n-var" label="Save the answer as" hint="Use it later as {{vars.<name>}}.">
            <Input id="n-var" value={str(data.variable)} onChange={(e) => set({ variable: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
          </Field>
          <Field id="n-validation" label="Expect">
            <Select value={str(data.validation) || 'none'} onValueChange={(validation) => set({ validation })}>
              <SelectTrigger id="n-validation">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Any text</SelectItem>
                <SelectItem value="email">An email address</SelectItem>
                <SelectItem value="phone">A phone number</SelectItem>
                <SelectItem value="number">A number</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-2">
            <Label>Quick options (optional)</Label>
            <p className="text-[11px] text-muted-foreground">Up to 3 show as buttons, up to 10 as a list. The option id is saved.</p>
            {options.map((o, i) => (
              <div key={i} className="flex gap-2">
                <Input aria-label={`Option ${i + 1}`} maxLength={24} value={o.title} onChange={(e) => set({ options: options.map((x, j) => (j === i ? { id: slug(e.target.value), title: e.target.value } : x)) })} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remove option" onClick={() => set({ options: options.filter((_, j) => j !== i) })}>
                  <X />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" disabled={options.length >= 10} onClick={() => set({ options: [...options, { id: `opt_${options.length + 1}`, title: `Option ${options.length + 1}` }] })}>
              <Plus /> Add option
            </Button>
          </div>
          <Field id="n-error" label="If the answer is invalid">
            <Input id="n-error" value={str(data.errorMessage)} placeholder="Sorry, I didn’t get that. Please try again." onChange={(e) => set({ errorMessage: e.target.value || undefined })} />
          </Field>
        </>
      ) : null}

      {type === 'buttons' ? (
        <>
          <Field id="n-btext" label="Message" hint={VARIABLE_HINT}>
            <Textarea id="n-btext" rows={3} maxLength={1024} value={str(data.text)} onChange={(e) => set({ text: e.target.value })} />
          </Field>
          <div className="space-y-2">
            <Label>Buttons (max 3, 20 characters)</Label>
            {buttons.map((b, i) => (
              <div key={b.id} className="flex gap-2">
                <Input aria-label={`Button ${i + 1}`} maxLength={20} value={b.title} onChange={(e) => set({ buttons: buttons.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} />
                <Button type="button" size="icon" variant="ghost" aria-label="Remove button" disabled={buttons.length === 1} onClick={() => set({ buttons: buttons.filter((_, j) => j !== i) })}>
                  <X />
                </Button>
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" disabled={buttons.length >= 3} onClick={() => set({ buttons: [...buttons, { id: `opt_${Math.random().toString(36).slice(2, 7)}`, title: `Option ${buttons.length + 1}` }] })}>
              <Plus /> Add button
            </Button>
            <p className="text-[11px] text-muted-foreground">Drag from each button’s dot to choose where it leads.</p>
          </div>
        </>
      ) : null}

      {type === 'condition' ? (
        <>
          <Field id="n-cvar" label="Check" hint="e.g. vars.topic, contact.custom.city">
            <Input id="n-cvar" value={str(data.variable)} onChange={(e) => set({ variable: e.target.value })} />
          </Field>
          <Field id="n-op" label="Operator">
            <Select value={str(data.operator) || 'equals'} onValueChange={(operator) => set({ operator })}>
              <SelectTrigger id="n-op">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITION_OPERATORS.map((op) => (
                  <SelectItem key={op} value={op}>
                    {op.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {!['is_set', 'is_not_set'].includes(str(data.operator)) ? (
            <Field id="n-cval" label="Value">
              <Input id="n-cval" value={str(data.value)} onChange={(e) => set({ value: e.target.value })} />
            </Field>
          ) : null}
        </>
      ) : null}

      {type === 'set_variable' ? (
        <>
          <Field id="n-svar" label="Variable">
            <Input id="n-svar" value={str(data.variable)} onChange={(e) => set({ variable: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '') })} />
          </Field>
          <Field id="n-sval" label="Value" hint={VARIABLE_HINT}>
            <Input id="n-sval" value={str(data.value)} onChange={(e) => set({ value: e.target.value })} />
          </Field>
        </>
      ) : null}

      {type === 'label' ? (
        <Field id="n-label" label="Label">
          <Select value={str(data.labelId)} onValueChange={(labelId) => set({ labelId })}>
            <SelectTrigger id="n-label">
              <SelectValue placeholder="Choose a label" />
            </SelectTrigger>
            <SelectContent>
              {(labels.data ?? []).map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      {type === 'assign' ? (
        <>
          <Field id="n-assign" label="Assign to">
            <Select value={str(data.assignTo) || 'unassigned'} onValueChange={(assignTo) => set({ assignTo })}>
              <SelectTrigger id="n-assign">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="unassigned">Team inbox (unassigned)</SelectItem>
                {(members.data ?? [])
                  .filter((m) => m.role !== 'viewer')
                  .map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.full_name ?? m.email}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="n-note" label="Internal note for the team" hint={VARIABLE_HINT}>
            <Textarea id="n-note" rows={3} value={str(data.note)} onChange={(e) => set({ note: e.target.value })} />
          </Field>
        </>
      ) : null}

      {type === 'ai_reply' ? (
        <Field id="n-fallback" label="If the knowledge base has no answer" hint="Answers come from Settings → AI & knowledge (Pro plan).">
          <Textarea id="n-fallback" rows={3} value={str(data.fallback)} onChange={(e) => set({ fallback: e.target.value })} />
        </Field>
      ) : null}

      {type === 'http_request' ? <HttpStep data={data} set={set} /> : null}

      {type === 'send_template' ? <TemplateStep data={data} set={set} /> : null}

      {type === 'end' ? (
        <Field id="n-end" label="Closing message (optional)" hint={VARIABLE_HINT}>
          <Textarea id="n-end" rows={3} value={str(data.text)} onChange={(e) => set({ text: e.target.value || undefined })} />
        </Field>
      ) : null}

      {onDelete && type !== 'start' ? (
        <Button type="button" variant="outline" className="w-full text-danger" onClick={onDelete}>
          <Trash2 /> Delete step
        </Button>
      ) : null}
    </div>
  );
}
