'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Braces, CreditCard, FileSpreadsheet, KeyRound, Plug, Plus, RefreshCw, ShoppingBag, Smartphone, Store, Trash2, Wallet, Workflow, X, Zap, type LucideIcon } from 'lucide-react';
import type { IntegrationProvider, OrderNotification, SignedIntegrationProvider } from '@talkzi/shared';
import { summarizeTemplate } from '@talkzi/whatsapp/templates';
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
import { Alert, AlertDescription } from '@talkzi/ui/alert';
import { Badge } from '@talkzi/ui/badge';
import { Button } from '@talkzi/ui/button';
import { Card, CardContent } from '@talkzi/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@talkzi/ui/dialog';
import { Input } from '@talkzi/ui/input';
import { Label } from '@talkzi/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@talkzi/ui/select';
import { Skeleton } from '@talkzi/ui/skeleton';
import { toast } from '@talkzi/ui/sonner';
import { Switch } from '@talkzi/ui/switch';
import { apiFetch } from '@/lib/api/client';
import { timeAgo } from '@/lib/format';
import type { IntegrationResponse } from '@/lib/public-api/integration-rows';
import { CopyField } from './copy-field';

interface TopicOption {
  value: string;
  label: string;
  phonePath: string;
  hints: string[];
}

interface ProviderMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  /** Verified with the provider's own signing secret; events map to approved templates. */
  signed: boolean;
  steps: string[];
}

const SHOPIFY_ORDER_HINTS = ['customer.first_name', 'name', 'total_price', 'currency', 'order_status_url', 'shipping_address.city'];
const WOO_ORDER_HINTS = ['billing.first_name', 'number', 'total', 'currency', 'status'];

const EVENT_TOPICS: Record<SignedIntegrationProvider, TopicOption[]> = {
  shopify: [
    { value: 'orders/create', label: 'Order created', phonePath: 'shipping_address.phone', hints: SHOPIFY_ORDER_HINTS },
    { value: 'orders/paid', label: 'Order paid', phonePath: 'shipping_address.phone', hints: SHOPIFY_ORDER_HINTS },
    { value: 'orders/fulfilled', label: 'Order fulfilled', phonePath: 'shipping_address.phone', hints: SHOPIFY_ORDER_HINTS },
    { value: 'orders/cancelled', label: 'Order cancelled', phonePath: 'shipping_address.phone', hints: [...SHOPIFY_ORDER_HINTS, 'cancel_reason'] },
    {
      value: 'fulfillments/create',
      label: 'Shipment created',
      phonePath: 'destination.phone',
      hints: ['destination.first_name', 'name', 'tracking_company', 'tracking_number', 'tracking_url'],
    },
    { value: 'checkouts/create', label: 'Checkout started', phonePath: 'shipping_address.phone', hints: ['customer.first_name', 'total_price', 'currency', 'abandoned_checkout_url'] },
  ],
  woocommerce: [
    { value: 'order.created', label: 'Order created', phonePath: 'billing.phone', hints: WOO_ORDER_HINTS },
    { value: 'order.updated', label: 'Order updated', phonePath: 'billing.phone', hints: WOO_ORDER_HINTS },
    { value: 'customer.created', label: 'Customer created', phonePath: 'billing.phone', hints: ['first_name', 'last_name', 'email'] },
  ],
  stripe: [
    {
      value: 'checkout.session.completed',
      label: 'Checkout completed',
      phonePath: 'data.object.customer_details.phone',
      hints: ['data.object.customer_details.name', 'data.object.amount_total', 'data.object.currency', 'data.object.id'],
    },
    {
      value: 'invoice.paid',
      label: 'Invoice paid',
      phonePath: 'data.object.customer_phone',
      hints: ['data.object.customer_name', 'data.object.amount_paid', 'data.object.number', 'data.object.hosted_invoice_url'],
    },
    {
      value: 'invoice.payment_failed',
      label: 'Invoice payment failed',
      phonePath: 'data.object.customer_phone',
      hints: ['data.object.customer_name', 'data.object.amount_due', 'data.object.hosted_invoice_url'],
    },
    {
      value: 'payment_intent.succeeded',
      label: 'Payment succeeded',
      phonePath: 'data.object.shipping.phone',
      hints: ['data.object.shipping.name', 'data.object.amount_received', 'data.object.currency'],
    },
  ],
};

const PROVIDERS: Record<IntegrationProvider, ProviderMeta> = {
  zapier: {
    label: 'Zapier',
    description: 'Send WhatsApp messages and sync contacts from 6,000+ apps.',
    icon: Zap,
    signed: false,
    steps: [
      'In your Zap, add the action “Webhooks by Zapier → POST”.',
      'Paste the URL below, set Payload Type to JSON and Unflatten to Yes.',
      'Add a header X-Talkzi-Token with your token.',
      'Add data such as action = send_message, to, type = template, template__name, template__language, template__variables.',
      'To start Zaps from Talkzi events, add a “Catch Hook” URL under the Webhooks tab.',
    ],
  },
  n8n: {
    label: 'n8n',
    description: 'Call Talkzi from your workflows with the HTTP Request node.',
    icon: Workflow,
    signed: false,
    steps: [
      'Add an HTTP Request node: method POST, the URL below, body JSON.',
      'Add a header X-Talkzi-Token with your token.',
      'Send {"action":"send_message", …} or {"action":"upsert_contact", …} — see the example.',
      'To react to Talkzi events, add an n8n Webhook node URL under the Webhooks tab.',
    ],
  },
  google_sheets: {
    label: 'Google Sheets',
    description: 'Add sheet or Google Form rows as contacts, or message them.',
    icon: FileSpreadsheet,
    signed: false,
    steps: [
      'In your sheet open Extensions → Apps Script and paste the script below.',
      'Replace the column positions with yours, then save.',
      'Add a trigger (Triggers → Add trigger) for “On form submit” or “On edit”.',
    ],
  },
  shopify: {
    label: 'Shopify',
    description: 'Order confirmations, shipping updates and checkout follow-ups.',
    icon: ShoppingBag,
    signed: true,
    steps: [
      'In Shopify admin open Settings → Notifications → Webhooks and click “Create webhook”.',
      'Pick an event you mapped (e.g. Order creation), format JSON, and paste the URL below.',
      'Copy the signing secret shown on that page (“Your webhooks will be signed with …”) into this connection.',
    ],
  },
  woocommerce: {
    label: 'WooCommerce',
    description: 'Message customers when orders are placed or updated.',
    icon: Store,
    signed: true,
    steps: [
      'In WordPress open WooCommerce → Settings → Advanced → Webhooks → Add webhook.',
      'Choose a topic you mapped (e.g. Order created), status Active, and paste the URL below as Delivery URL.',
      'Use the same Secret here and in WooCommerce, then save.',
    ],
  },
  stripe: {
    label: 'Stripe',
    description: 'Payment receipts and failed-payment reminders on WhatsApp.',
    icon: CreditCard,
    signed: true,
    steps: [
      'In the Stripe Dashboard open Developers → Webhooks → Add endpoint and paste the URL below.',
      'Select the events you mapped (e.g. checkout.session.completed).',
      'Copy the endpoint’s signing secret (whsec_…) into this connection. Collect phone numbers in Checkout so payloads include one; amounts are in the smallest currency unit.',
    ],
  },
  custom: {
    label: 'Custom app',
    description: 'Any system that can make an HTTP POST — your CRM, ERP or backend.',
    icon: Braces,
    signed: false,
    steps: [
      'POST JSON to the URL below with a header X-Talkzi-Token, or sign the raw body with X-Talkzi-Signature (same scheme as outgoing webhooks).',
      'Use action send_message or upsert_contact — see the example.',
      'For full access (templates, conversations, cursor pagination) use an API key with the REST API instead.',
    ],
  },
};

/** Wallet payment notifications need a merchant IPN integration — shown, not yet connectable. */
const COMING_SOON: { label: string; description: string; icon: LucideIcon }[] = [
  { label: 'JazzCash', description: 'Payment confirmations on WhatsApp from JazzCash IPN.', icon: Wallet },
  { label: 'Easypaisa', description: 'Payment confirmations on WhatsApp from Easypaisa.', icon: Smartphone },
];

const integrationsKey = ['integrations'] as const;

interface TemplateOption {
  id: string;
  name: string;
  language: string;
  category: string;
  components: unknown;
}

/** Event notifications fill body variables only, so templates needing a media header, header text variables or URL suffixes are excluded. */
function bodyVariableCount(components: unknown): number | null {
  const summary = summarizeTemplate(components);
  const mediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT', 'LOCATION'].includes(summary.header.format);
  if (mediaHeader || summary.header.variables.length > 0 || summary.dynamicUrlButtons.length > 0) return null;
  return summary.body.variables.length;
}

function appsScript(url: string, token: string) {
  return `function onFormSubmit(e) {
  // Column order of your sheet/form: Timestamp, Name, Phone
  const [, name, phone] = e.values;
  UrlFetchApp.fetch('${url}', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'X-Talkzi-Token': '${token}' },
    payload: JSON.stringify({ action: 'upsert_contact', phone, name, labels: ['Google Sheets'] }),
  });
}`;
}

function exampleCurl(url: string, token: string) {
  return `curl -X POST '${url}' \\
  -H 'Content-Type: application/json' \\
  -H 'X-Talkzi-Token: ${token}' \\
  -d '{"action":"send_message","to":"+923001234567","type":"template",
       "template":{"name":"order_update","language":"en","variables":["Ayesha","#1042"]}}'`;
}

// ---------------------------------------------------------------------------
// Event → template mapping (Shopify, WooCommerce, Stripe)
// ---------------------------------------------------------------------------

interface DraftNotification {
  key: string;
  topic: string;
  template: string; // "name|language"
  variables: string[];
  phonePath: string;
}

let draftSeq = 0;
const newDraftKey = () => `n${++draftSeq}`;

function toDrafts(notifications: OrderNotification[]): DraftNotification[] {
  return notifications.map((n) => ({ key: newDraftKey(), topic: n.topic, template: `${n.templateName}|${n.language}`, variables: n.variables, phonePath: n.phonePath }));
}

function fromDrafts(drafts: DraftNotification[]): OrderNotification[] {
  return drafts.map((d) => {
    const [templateName = '', language = 'en'] = d.template.split('|');
    return { topic: d.topic, templateName, language, variables: d.variables.map((v) => v.trim()), phonePath: d.phonePath.trim() };
  });
}

function draftsValid(drafts: DraftNotification[]) {
  return drafts.every((d) => d.topic && d.template && d.phonePath.trim() && d.variables.every((v) => v.trim()));
}

function NotificationEditor({
  provider,
  drafts,
  onChange,
  templates,
}: {
  provider: SignedIntegrationProvider;
  drafts: DraftNotification[];
  onChange: (drafts: DraftNotification[]) => void;
  templates: TemplateOption[];
}) {
  const topics = EVENT_TOPICS[provider];
  const usable = templates.flatMap((t) => {
    const count = bodyVariableCount(t.components);
    return count === null ? [] : [{ ...t, count, value: `${t.name}|${t.language}` }];
  });
  const update = (key: string, patch: Partial<DraftNotification>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...patch } : d)));

  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-medium">Messages</legend>
      <p className="text-xs text-muted-foreground">
        Send an approved template when an event arrives. Variables are read from the event payload with dot paths, e.g.{' '}
        <code>customer.first_name</code>.
      </p>
      {usable.length === 0 ? (
        <Alert variant="warning">
          <AlertDescription>
            No approved templates with text-only variables yet. <Link className="underline" href="/app/templates/new">Create a utility template</Link> and
            come back once Meta approves it.
          </AlertDescription>
        </Alert>
      ) : null}
      {drafts.map((draft, index) => {
        const topic = topics.find((t) => t.value === draft.topic);
        const listId = `hints-${draft.key}`;
        return (
          <div key={draft.key} className="space-y-3 rounded-xl border border-border p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground">Message {index + 1}</p>
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove message ${index + 1}`} onClick={() => onChange(drafts.filter((d) => d.key !== draft.key))}>
                <X />
              </Button>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor={`${draft.key}-topic`}>When</Label>
                <Select
                  value={draft.topic}
                  onValueChange={(value) => {
                    const next = topics.find((t) => t.value === value);
                    update(draft.key, { topic: value, phonePath: next?.phonePath ?? draft.phonePath });
                  }}
                >
                  <SelectTrigger id={`${draft.key}-topic`}>
                    <SelectValue placeholder="Pick an event" />
                  </SelectTrigger>
                  <SelectContent>
                    {topics.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`${draft.key}-template`}>Send template</Label>
                <Select
                  value={draft.template}
                  onValueChange={(value) => {
                    const count = usable.find((t) => t.value === value)?.count ?? 0;
                    update(draft.key, { template: value, variables: Array.from({ length: count }, (_, i) => draft.variables[i] ?? '') });
                  }}
                >
                  <SelectTrigger id={`${draft.key}-template`}>
                    <SelectValue placeholder="Approved template" />
                  </SelectTrigger>
                  <SelectContent>
                    {usable.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.name} · {t.language}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <datalist id={listId}>
              {(topic?.hints ?? []).map((hint) => (
                <option key={hint} value={hint} />
              ))}
            </datalist>
            {draft.variables.map((value, i) => (
              <div key={i} className="space-y-1.5">
                <Label htmlFor={`${draft.key}-var-${i}`}>{`{{${i + 1}}}`} from</Label>
                <Input
                  id={`${draft.key}-var-${i}`}
                  list={listId}
                  value={value}
                  onChange={(e) => update(draft.key, { variables: draft.variables.map((v, j) => (j === i ? e.target.value : v)) })}
                  placeholder={topic?.hints[i] ?? 'customer.first_name'}
                  className="font-mono text-xs"
                />
              </div>
            ))}
            <div className="space-y-1.5">
              <Label htmlFor={`${draft.key}-phone`}>Customer phone from</Label>
              <Input
                id={`${draft.key}-phone`}
                value={draft.phonePath}
                onChange={(e) => update(draft.key, { phonePath: e.target.value })}
                className="font-mono text-xs"
              />
            </div>
          </div>
        );
      })}
      {drafts.length < 10 ? (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...drafts, { key: newDraftKey(), topic: topics[0]!.value, template: '', variables: [], phonePath: topics[0]!.phonePath }])}
        >
          <Plus /> Add message
        </Button>
      ) : null}
    </fieldset>
  );
}

function useApprovedTemplates(enabled: boolean) {
  return useQuery({
    queryKey: ['templates', 'approved'],
    queryFn: () => apiFetch<TemplateOption[]>('/api/templates?status=APPROVED'),
    enabled,
  });
}

// ---------------------------------------------------------------------------
// Connect / edit dialogs
// ---------------------------------------------------------------------------

function ConnectedInstructions({ integration, token }: { integration: IntegrationResponse; token: string | null }) {
  const meta = PROVIDERS[integration.provider];
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Webhook URL</Label>
        <CopyField value={integration.incomingUrl} label="Webhook URL" />
      </div>
      {token ? (
        <div className="space-y-1.5">
          <Label>Token (shown once)</Label>
          <CopyField value={token} label="Integration token" secret />
        </div>
      ) : null}
      <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
        {meta.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {!meta.signed ? (
        <pre className="overflow-x-auto rounded-xl bg-muted p-3 text-[11px] leading-relaxed scrollbar-thin">
          <code>
            {integration.provider === 'google_sheets'
              ? appsScript(integration.incomingUrl, token ?? '<your token>')
              : exampleCurl(integration.incomingUrl, token ?? '<your token>')}
          </code>
        </pre>
      ) : null}
    </div>
  );
}

function ConnectDialog({ provider, onClose }: { provider: IntegrationProvider | null; onClose: () => void }) {
  const qc = useQueryClient();
  const meta = provider ? PROVIDERS[provider] : null;
  const signed = Boolean(meta?.signed);
  const [name, setName] = React.useState('');
  const [secret, setSecret] = React.useState('');
  const [drafts, setDrafts] = React.useState<DraftNotification[]>([]);
  const [created, setCreated] = React.useState<{ integration: IntegrationResponse; token: string | null } | null>(null);
  const templates = useApprovedTemplates(signed);

  const reset = () => {
    setName('');
    setSecret('');
    setDrafts([]);
    setCreated(null);
  };

  const connect = useMutation({
    mutationFn: () =>
      apiFetch<IntegrationResponse & { token: string | null }>('/api/integrations', {
        body: {
          provider,
          name: name.trim() || meta?.label,
          ...(signed && secret.trim() ? { signingSecret: secret.trim() } : {}),
          notifications: signed ? fromDrafts(drafts) : [],
        },
      }),
    onSuccess: ({ token, ...integration }) => {
      setCreated({ integration, token });
      void qc.invalidateQueries({ queryKey: integrationsKey });
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog
      open={Boolean(provider)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
          reset();
        }
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{created ? `${meta?.label} connected` : `Connect ${meta?.label ?? ''}`}</DialogTitle>
          <DialogDescription>{created ? 'Finish the setup in the other app with these details.' : meta?.description}</DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="space-y-4">
            <ConnectedInstructions integration={created.integration} token={created.token} />
            <DialogFooter>
              <Button
                onClick={() => {
                  onClose();
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : provider ? (
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              connect.mutate();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="int-name">Name</Label>
              <Input id="int-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={meta?.label} />
            </div>
            {signed ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="int-secret">Webhook signing secret</Label>
                  <Input id="int-secret" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="off" className="font-mono text-xs" />
                  <p className="text-xs text-muted-foreground">
                    {provider === 'shopify'
                      ? 'Shown in Shopify under Settings → Notifications → Webhooks. You can add it after creating the webhook.'
                      : provider === 'stripe'
                        ? 'The endpoint’s signing secret (whsec_…) from Developers → Webhooks. You can add it after creating the endpoint.'
                        : 'The Secret you enter when adding the webhook in WooCommerce. You can add it later.'}
                  </p>
                </div>
                <NotificationEditor provider={provider as SignedIntegrationProvider} drafts={drafts} onChange={setDrafts} templates={templates.data ?? []} />
              </>
            ) : null}
            <DialogFooter>
              <Button type="submit" loading={connect.isPending} disabled={signed && !draftsValid(drafts)}>
                Connect
              </Button>
            </DialogFooter>
          </form>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function EditSignedDialog({ integration, onClose }: { integration: IntegrationResponse; onClose: () => void }) {
  const qc = useQueryClient();
  const [secret, setSecret] = React.useState('');
  const [drafts, setDrafts] = React.useState(() => toDrafts(integration.notifications));
  const templates = useApprovedTemplates(true);

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/integrations/${integration.id}`, {
        method: 'PATCH',
        body: { notifications: fromDrafts(drafts), ...(secret.trim() ? { signingSecret: secret.trim() } : {}) },
      }),
    onSuccess: () => {
      toast.success('Connection updated.');
      void qc.invalidateQueries({ queryKey: integrationsKey });
      onClose();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{integration.name}</DialogTitle>
          <DialogDescription>Change which messages are sent for each event, or replace the signing secret.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label>Webhook URL</Label>
            <CopyField value={integration.incomingUrl} label="Webhook URL" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-secret">Webhook signing secret</Label>
            <Input
              id="edit-secret"
              value={secret}
              onChange={(e) => setSecret(e.target.value)}
              autoComplete="off"
              className="font-mono text-xs"
              placeholder={integration.hasSecret ? 'Leave blank to keep the current secret' : 'Paste the signing secret'}
            />
          </div>
          <NotificationEditor provider={integration.provider as SignedIntegrationProvider} drafts={drafts} onChange={setDrafts} templates={templates.data ?? []} />
          <DialogFooter>
            <Button type="submit" loading={save.isPending} disabled={!draftsValid(drafts)}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RotatedTokenDialog({ result, onClose }: { result: { integration: IntegrationResponse; token: string } | null; onClose: () => void }) {
  return (
    <Dialog open={Boolean(result)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>New token for {result?.integration.name}</DialogTitle>
          <DialogDescription>The old token stopped working. Update it in {result ? PROVIDERS[result.integration.provider].label : 'the other app'}.</DialogDescription>
        </DialogHeader>
        {result ? <ConnectedInstructions integration={result.integration} token={result.token} /> : null}
        <DialogFooter>
          <Button onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

/** App catalogue plus connected apps (Zapier, n8n, Shopify, WooCommerce, custom). */
export function AppsPanel() {
  const qc = useQueryClient();
  const [connecting, setConnecting] = React.useState<IntegrationProvider | null>(null);
  const [editing, setEditing] = React.useState<IntegrationResponse | null>(null);
  const [rotated, setRotated] = React.useState<{ integration: IntegrationResponse; token: string } | null>(null);
  const integrations = useQuery({ queryKey: integrationsKey, queryFn: () => apiFetch<IntegrationResponse[]>('/api/integrations') });

  const setStatus = useMutation({
    mutationFn: ({ id, connected }: { id: string; connected: boolean }) =>
      apiFetch(`/api/integrations/${id}`, { method: 'PATCH', body: { status: connected ? 'connected' : 'disconnected' } }),
    onSuccess: (_data, vars) => {
      toast.success(vars.connected ? 'Connection resumed.' : 'Connection paused — incoming events are rejected.');
      void qc.invalidateQueries({ queryKey: integrationsKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const rotate = useMutation({
    mutationFn: (id: string) => apiFetch<IntegrationResponse & { token: string }>(`/api/integrations/${id}`, { method: 'PATCH', body: { rotateToken: true } }),
    onSuccess: ({ token, ...integration }) => {
      setRotated({ integration, token });
      void qc.invalidateQueries({ queryKey: integrationsKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Connection removed.');
      void qc.invalidateQueries({ queryKey: integrationsKey });
    },
    onError: (error) => toast.error(error.message),
  });

  const rows = integrations.data ?? [];

  return (
    <div className="space-y-8">
      <section aria-labelledby="apps-catalogue" className="space-y-3">
        <h2 id="apps-catalogue" className="text-sm font-semibold">
          Connect an app
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {(Object.keys(PROVIDERS) as IntegrationProvider[]).map((provider) => {
            const meta = PROVIDERS[provider];
            return (
              <li key={provider}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3 p-4">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary dark:text-accent">
                        <meta.icon className="size-5" aria-hidden />
                      </span>
                      <p className="font-medium">{meta.label}</p>
                    </div>
                    <p className="flex-1 text-sm text-muted-foreground">{meta.description}</p>
                    <Button size="sm" variant="outline" className="self-start" onClick={() => setConnecting(provider)}>
                      <Plug /> Connect
                    </Button>
                  </CardContent>
                </Card>
              </li>
            );
          })}
          {COMING_SOON.map((item) => (
            <li key={item.label}>
              <Card className="h-full opacity-70">
                <CardContent className="flex h-full flex-col gap-3 p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-muted text-muted-foreground">
                      <item.icon className="size-5" aria-hidden />
                    </span>
                    <p className="font-medium">{item.label}</p>
                    <Badge variant="secondary">Coming soon</Badge>
                  </div>
                  <p className="flex-1 text-sm text-muted-foreground">{item.description}</p>
                  <Button size="sm" variant="outline" className="self-start" disabled>
                    <Plug /> Connect
                  </Button>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="apps-connected" className="space-y-3">
        <h2 id="apps-connected" className="text-sm font-semibold">
          Connected
        </h2>
        {integrations.isLoading ? (
          <Skeleton className="h-20 rounded-2xl" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing connected yet.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border">
            {rows.map((row) => {
              const meta = PROVIDERS[row.provider] ?? PROVIDERS.custom;
              const connected = row.status === 'connected';
              return (
                <li key={row.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <meta.icon className="size-4 text-muted-foreground" aria-hidden />
                      {row.name}
                      <Badge variant="outline">{meta.label}</Badge>
                      {!connected ? <Badge variant="secondary">Paused</Badge> : null}
                      {meta.signed && !row.hasSecret ? <Badge variant="warning">Signing secret missing</Badge> : null}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {meta.signed ? `${row.notifications.length} message${row.notifications.length === 1 ? '' : 's'} mapped · ` : ''}
                      {row.last_event_at ? `last event ${timeAgo(row.last_event_at)}` : 'no events yet'}
                    </p>
                    <p className="truncate font-mono text-xs text-muted-foreground" title={row.incomingUrl}>
                      {row.incomingUrl}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Switch
                      checked={connected}
                      onCheckedChange={(next) => setStatus.mutate({ id: row.id, connected: next })}
                      disabled={setStatus.isPending}
                      aria-label={connected ? `Pause ${row.name}` : `Resume ${row.name}`}
                    />
                    {meta.signed ? (
                      <Button size="sm" variant="outline" onClick={() => setEditing(row)}>
                        Edit
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => rotate.mutate(row.id)} loading={rotate.isPending && rotate.variables === row.id}>
                        <RefreshCw /> New token
                      </Button>
                    )}
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" aria-label={`Remove ${row.name}`}>
                          <Trash2 />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Remove {row.name}?</AlertDialogTitle>
                          <AlertDialogDescription>Its webhook URL stops working immediately. Remove the webhook in {meta.label} too.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction destructive onClick={() => remove.mutate(row.id)}>
                            Remove
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <Alert variant="info">
        <AlertDescription className="flex flex-wrap items-center gap-1">
          <KeyRound className="size-4" aria-hidden /> Building something custom? The REST API covers messages, contacts, templates and conversations —{' '}
          <Link className="underline" href="/docs">
            read the docs
          </Link>
          .
        </AlertDescription>
      </Alert>

      <ConnectDialog provider={connecting} onClose={() => setConnecting(null)} />
      {editing ? <EditSignedDialog key={editing.id} integration={editing} onClose={() => setEditing(null)} /> : null}
      <RotatedTokenDialog result={rotated} onClose={() => setRotated(null)} />
    </div>
  );
}
