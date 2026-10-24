import type { Metadata } from 'next';
import Link from 'next/link';
import { Section } from '@/components/marketing/section';

export const metadata: Metadata = {
  title: 'API docs',
  description: 'Talkzi REST API and webhooks: send WhatsApp messages, manage contacts and receive signed events.',
};

const endpoints = [
  { method: 'POST', path: '/messages', scope: 'messages:write', description: 'Send a text or template message' },
  { method: 'GET', path: '/contacts', scope: 'contacts:read', description: 'List contacts (search, cursor pagination)' },
  { method: 'POST', path: '/contacts', scope: 'contacts:write', description: 'Create or update a contact by phone' },
  { method: 'GET', path: '/templates', scope: 'templates:read', description: 'List message templates and statuses' },
  { method: 'GET', path: '/conversations', scope: 'conversations:read', description: 'List conversations' },
];

const events = [
  ['message.received', 'A customer sent a message'],
  ['message.status', 'An outbound message was sent, delivered, read or failed'],
  ['conversation.created', 'A new conversation started'],
  ['conversation.resolved', 'A conversation was marked resolved'],
  ['contact.created', 'A contact was created'],
  ['broadcast.completed', 'A broadcast finished sending'],
  ['template.status', 'A template was approved, rejected or paused'],
];

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-2xl border border-border bg-muted/60 p-4 font-mono text-[13px] leading-relaxed">
      <code>{children}</code>
    </pre>
  );
}

export default function DocsPage() {
  return (
    <Section>
      <div className="grid gap-12 lg:grid-cols-[200px_1fr]">
        <nav aria-label="Docs" className="hidden lg:block">
          <ul className="sticky top-24 space-y-1 text-sm">
            {['Introduction', 'Authentication', 'Endpoints', 'Send a message', 'Errors', 'Webhooks', 'Verify signatures', 'Incoming webhooks'].map(
              (label) => (
                <li key={label}>
                  <a
                    href={`#${label.toLowerCase().replace(/\s+/g, '-')}`}
                    className="block rounded-lg px-2 py-1 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
                  >
                    {label}
                  </a>
                </li>
              ),
            )}
          </ul>
        </nav>

        <article className="max-w-3xl space-y-12">
          <header id="introduction" className="scroll-mt-24">
            <h1 className="text-4xl font-bold tracking-tight">Talkzi API</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Send WhatsApp messages, sync contacts and react to events from your own systems. The REST API is available
              on Pro and Agency plans.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Base URL: <code className="rounded bg-muted px-1.5 py-0.5">https://&lt;your-domain&gt;/api/public/v1</code> ·
              Machine-readable spec: <Link className="text-primary hover:underline" href="/api/public/v1/openapi.json">openapi.json</Link>
            </p>
          </header>

          <section id="authentication" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Authentication</h2>
            <p className="text-muted-foreground">
              Create an API key in <strong className="text-foreground">Integrations → API keys</strong> and choose its
              scopes. Send it as a bearer token. Keys are shown once and stored hashed.
            </p>
            <Code>{`curl https://app.talkzi.app/api/public/v1/contacts \\
  -H "Authorization: Bearer tk_live_xxxxxxxxxxxxxxxxxxxxxxxx"`}</Code>
            <p className="text-sm text-muted-foreground">
              Rate limit: 60 requests per minute per key. Responses include <code>X-RateLimit-Limit</code>,{' '}
              <code>X-RateLimit-Remaining</code> and <code>X-RateLimit-Reset</code>.
            </p>
          </section>

          <section id="endpoints" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Endpoints</h2>
            <div className="overflow-x-auto rounded-2xl border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-muted-foreground">
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Path</th>
                    <th className="px-4 py-3">Scope</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {endpoints.map((e) => (
                    <tr key={e.method + e.path} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-primary dark:text-accent">{e.method}</td>
                      <td className="px-4 py-3 font-mono text-xs">{e.path}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{e.scope}</td>
                      <td className="px-4 py-3">{e.description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section id="send-a-message" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Send a message</h2>
            <p className="text-muted-foreground">
              Free-form text is only allowed within 24 hours of the customer’s last message. Outside the window, send an
              approved template.
            </p>
            <Code>{`curl -X POST https://app.talkzi.app/api/public/v1/messages \\
  -H "Authorization: Bearer $TALKZI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "923001234567",
    "type": "template",
    "template": { "name": "order_update", "language": "en", "variables": ["Ayesha", "TZ-1042", "Friday"] }
  }'`}</Code>
            <Code>{`{ "data": { "id": "6f1c…", "wamid": "wamid.HBgM…", "status": "sent" } }`}</Code>
          </section>

          <section id="errors" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Errors</h2>
            <p className="text-muted-foreground">Errors use HTTP status codes and a stable machine-readable code:</p>
            <Code>{`HTTP/1.1 409 Conflict
{ "error": { "code": "SESSION_WINDOW_CLOSED", "message": "The 24-hour customer service window has closed. Send an approved template instead." } }`}</Code>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
              <li><code>UNAUTHORIZED</code> (401), <code>FORBIDDEN</code> (403), <code>NOT_FOUND</code> (404)</li>
              <li><code>VALIDATION_ERROR</code> (422) with field details</li>
              <li><code>SESSION_WINDOW_CLOSED</code>, <code>TEMPLATE_NOT_APPROVED</code>, <code>CONTACT_OPTED_OUT</code> (409)</li>
              <li><code>RATE_LIMITED</code> (429), <code>WHATSAPP_ERROR</code> (502)</li>
            </ul>
          </section>

          <section id="webhooks" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Webhooks</h2>
            <p className="text-muted-foreground">
              Add an endpoint in <strong className="text-foreground">Integrations → Webhooks</strong>. Failed deliveries
              are retried with exponential backoff for up to 24 hours.
            </p>
            <ul className="grid gap-2 sm:grid-cols-2">
              {events.map(([name, description]) => (
                <li key={name} className="rounded-xl border border-border p-3">
                  <code className="text-sm font-semibold">{name}</code>
                  <p className="text-xs text-muted-foreground">{description}</p>
                </li>
              ))}
            </ul>
          </section>

          <section id="verify-signatures" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Verify signatures</h2>
            <p className="text-muted-foreground">
              Each delivery includes <code>X-Talkzi-Signature: t=&lt;unix&gt;,v1=&lt;hex&gt;</code>, where{' '}
              <code>v1</code> is HMAC-SHA256 of <code>{'`${t}.${rawBody}`'}</code> using your endpoint secret.
            </p>
            <Code>{`import crypto from 'node:crypto';

export function verifyTalkzi(rawBody: string, header: string, secret: string) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')));
  const expected = crypto.createHmac('sha256', secret).update(\`\${parts.t}.\${rawBody}\`).digest('hex');
  const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300;
  const given = Buffer.from(parts.v1 ?? '');
  return fresh && given.length === expected.length && crypto.timingSafeEqual(Buffer.from(expected), given);
}`}</Code>
          </section>

          <section id="incoming-webhooks" className="scroll-mt-24 space-y-3">
            <h2 className="text-2xl font-semibold">Incoming webhooks</h2>
            <p className="text-muted-foreground">
              Connect Zapier, n8n or your own app in <strong className="text-foreground">Integrations → Apps</strong> to get a
              webhook URL and a token. POST one of two actions to it: <code>send_message</code> (same body as{' '}
              <code>POST /messages</code>) or <code>upsert_contact</code> (same body as <code>POST /contacts</code>).
            </p>
            <Code>{`curl -X POST https://app.talkzi.app/api/webhooks/incoming/<integration-id> \\
  -H "X-Talkzi-Token: tzin_xxxxxxxxxxxxxxxx" \\
  -H "Content-Type: application/json" \\
  -d '{ "action": "upsert_contact", "phone": "+923001234567", "name": "Ayesha", "labels": ["VIP"] }'`}</Code>
            <p className="text-sm text-muted-foreground">
              Shopify and WooCommerce connections are verified with the store’s own webhook signature and send the approved
              template you mapped to each event (for example <code>orders/create</code> or <code>order.created</code>).
            </p>
          </section>
        </article>
      </div>
    </Section>
  );
}
