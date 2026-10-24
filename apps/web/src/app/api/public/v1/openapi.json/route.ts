import { NextResponse } from 'next/server';
import { z } from 'zod';
import { API_SCOPES, publicContactUpsertSchema, publicSendMessageSchema, WEBHOOK_EVENT_META } from '@talkzi/shared';

export const dynamic = 'force-static';

const jsonSchema = (schema: z.ZodType) => z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' });

const errorResponse = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { error: { type: 'object', properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} }, required: ['code', 'message'] } },
      },
    },
  },
});

const list = (description: string) => ({
  description,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: { data: { type: 'object', properties: { items: { type: 'array', items: { type: 'object' } }, next_cursor: { type: ['string', 'null'] } } } },
      },
    },
  },
});

const pagination = [
  { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 50 } },
  { name: 'cursor', in: 'query', schema: { type: 'string' }, description: 'next_cursor from the previous page' },
];

const common = {
  '401': errorResponse('Missing, invalid or revoked API key'),
  '403': errorResponse('Missing scope, or the plan does not include API access'),
  '422': errorResponse('Validation error'),
  '429': errorResponse('Rate limited (60 requests/minute per key)'),
};

/** OpenAPI 3.1 description of the public REST API (schemas generated from the Zod validators). */
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'Talkzi API',
    version: '1.0.0',
    description: 'Send WhatsApp messages, manage contacts and read templates and conversations. Webhook events are signed with X-Talkzi-Signature.',
  },
  servers: [{ url: '/api/public/v1' }],
  security: [{ bearerAuth: [] }],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'tk_live_…', description: `Scopes: ${API_SCOPES.join(', ')}` },
    },
    schemas: {
      SendMessage: jsonSchema(publicSendMessageSchema),
      ContactUpsert: jsonSchema(publicContactUpsertSchema),
    },
  },
  paths: {
    '/messages': {
      post: {
        summary: 'Send a text or template message',
        description: 'Text is only allowed within 24 hours of the customer’s last message (SESSION_WINDOW_CLOSED otherwise). Scope: messages:write.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/SendMessage' } } } },
        responses: {
          '200': { description: 'Accepted by WhatsApp', content: { 'application/json': { schema: { type: 'object', properties: { data: { type: 'object', properties: { id: { type: 'string' }, wamid: { type: ['string', 'null'] }, status: { type: 'string' }, conversation_id: { type: 'string' }, contact_id: { type: 'string' } } } } } } } },
          '409': errorResponse('SESSION_WINDOW_CLOSED, TEMPLATE_NOT_APPROVED or CONTACT_OPTED_OUT'),
          '502': errorResponse('WHATSAPP_ERROR from the Cloud API'),
          ...common,
        },
      },
    },
    '/contacts': {
      get: {
        summary: 'List contacts',
        description: 'Newest first. Scope: contacts:read.',
        parameters: [...pagination, { name: 'q', in: 'query', schema: { type: 'string' }, description: 'Search name, email or phone' }],
        responses: { '200': list('A page of contacts'), ...common },
      },
      post: {
        summary: 'Create or update a contact by phone',
        description: 'Custom fields are merged; labels are matched by name and created when missing. Scope: contacts:write.',
        requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/ContactUpsert' } } } },
        responses: { '200': { description: 'The contact (created: true when new)' }, ...common },
      },
    },
    '/templates': {
      get: {
        summary: 'List message templates',
        description: 'Scope: templates:read.',
        parameters: [{ name: 'status', in: 'query', schema: { type: 'string', enum: ['APPROVED', 'PENDING', 'REJECTED', 'DRAFT', 'PAUSED', 'DISABLED'] } }],
        responses: { '200': list('Templates'), ...common },
      },
    },
    '/conversations': {
      get: {
        summary: 'List conversations',
        description: 'Newest first. Scope: conversations:read.',
        parameters: [...pagination, { name: 'status', in: 'query', schema: { type: 'string', enum: ['open', 'pending', 'snoozed', 'resolved'] } }],
        responses: { '200': list('A page of conversations'), ...common },
      },
    },
  },
  webhooks: Object.fromEntries(
    Object.entries(WEBHOOK_EVENT_META).map(([event, description]) => [
      event,
      {
        post: {
          summary: description,
          parameters: [{ name: 'X-Talkzi-Signature', in: 'header', required: true, schema: { type: 'string' }, description: 't=<unix>,v1=<hex HMAC-SHA256 of `${t}.${body}`>' }],
          requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { id: { type: 'string' }, type: { const: event }, created_at: { type: 'string' }, workspace_id: { type: 'string' }, data: { type: 'object' } } } } } },
          responses: { '200': { description: 'Return any 2xx within 10 seconds; anything else is retried with backoff for ~24 hours.' } },
        },
      },
    ]),
  ),
};

export function GET() {
  return NextResponse.json(spec, { headers: { 'cache-control': 'public, max-age=3600', 'access-control-allow-origin': '*' } });
}
