/**
 * Deterministic demo data for Talkzi. Pure (no I/O) so it can be inserted by
 * the seed script (Supabase) and validated against the schema in tests (PGlite).
 *
 * 1 workspace · 2 members · 1 mock WABA · 1 phone number · 50 contacts ·
 * 20 conversations × 5 messages · 3 canned replies · 2 labels ·
 * 3 templates (approved / pending / rejected) · 1 draft broadcast · 1 chatbot flow
 */
import type { Json, TablesInsert } from '../types';

// ---------------------------------------------------------------------------
// Deterministic ids (RFC 4122 v4 layout from a seeded PRNG)
// ---------------------------------------------------------------------------
function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedUuid(namespace: string, index = 0): string {
  const rand = mulberry32(hashString(`talkzi:${namespace}:${index}`));
  const bytes = Array.from({ length: 16 }, () => Math.floor(rand() * 256));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const SEED_IDS = {
  workspace: seedUuid('workspace'),
  waba: seedUuid('waba'),
  phoneNumber: seedUuid('phone-number'),
  labelVip: seedUuid('label', 0),
  labelLead: seedUuid('label', 1),
  templateApproved: seedUuid('template', 0),
  templatePending: seedUuid('template', 1),
  templateRejected: seedUuid('template', 2),
  broadcast: seedUuid('broadcast'),
  chatbotFlow: seedUuid('chatbot-flow'),
} as const;

export const SEED_META = {
  wabaId: '100000000000001',
  phoneNumberId: '100000000000002',
  displayPhoneNumber: '+92 300 0000000',
} as const;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const FIRST_NAMES = [
  'Ayesha', 'Ali', 'Fatima', 'Hassan', 'Zainab', 'Usman', 'Hira', 'Bilal', 'Sana', 'Hamza',
  'Maryam', 'Ahmed', 'Iqra', 'Saad', 'Mahnoor', 'Umar', 'Areeba', 'Fahad', 'Noor', 'Danish',
  'Amna', 'Taha', 'Rabia', 'Zeeshan', 'Kinza',
];
const LAST_NAMES = [
  'Khan', 'Raza', 'Ahmed', 'Ali', 'Malik', 'Tariq', 'Shah', 'Qureshi', 'Iqbal', 'Siddiqui',
  'Butt', 'Chaudhry', 'Hussain', 'Javed', 'Mirza',
];
const CITIES = ['Lahore', 'Karachi', 'Islamabad', 'Rawalpindi', 'Faisalabad', 'Multan', 'Peshawar', 'Quetta'];
const MOBILE_PREFIXES = ['300', '301', '321', '333', '345'];

type Line = { dir: 'in' | 'out'; text: string; template?: boolean };

const SCRIPTS: Line[][] = [
  [
    { dir: 'in', text: 'Assalam o Alaikum! Is the embroidered lawn suit still available?' },
    { dir: 'out', text: "Walaikum Assalam! Yes, it's available in S, M and L. 😊" },
    { dir: 'in', text: 'Price kya hai? And do you deliver to Lahore?' },
    { dir: 'out', text: 'PKR 4,500 with free delivery anywhere in Pakistan. Delivery takes 2–3 days.' },
    { dir: 'in', text: "Great, I'll take a Medium. Is cash on delivery possible?" },
  ],
  [
    { dir: 'in', text: "Hi, my order #TZ-1042 hasn't arrived yet." },
    { dir: 'out', text: 'Sorry about the delay! Let me check that for you.' },
    { dir: 'out', text: 'Your parcel is with TCS and will arrive tomorrow. Tracking: 7734 2219 001.' },
    { dir: 'in', text: 'Thank you so much!' },
    { dir: 'out', text: 'Anytime! Anything else I can help with?' },
  ],
  [
    { dir: 'out', text: 'Hi {{name}}, enjoy 15% off your next order at Demo Store! Use code EID15 at checkout.', template: true },
    { dir: 'in', text: 'Is this valid on the new collection?' },
    { dir: 'out', text: "Yes, it's valid on everything including new arrivals!" },
    { dir: 'in', text: 'Awesome, ordering now 🛍️' },
    { dir: 'out', text: 'Thank you! Your order will be confirmed shortly.' },
  ],
  [
    { dir: 'in', text: 'Do you offer wholesale prices for 20+ pieces?' },
    { dir: 'out', text: 'Yes! Orders of 20+ pieces get 15% off. Which articles are you interested in?' },
    { dir: 'in', text: 'The khaddar collection. Can you share the catalog?' },
    { dir: 'out', text: 'Sharing the catalog now 📎' },
    { dir: 'in', text: 'Received, will confirm by evening.' },
  ],
  [
    { dir: 'in', text: 'I received the wrong size, can I exchange it?' },
    { dir: 'out', text: 'Of course! Exchanges are free within 7 days. Could you share your order number?' },
    { dir: 'in', text: 'TZ-1088' },
    { dir: 'out', text: 'Thanks! A rider will pick it up tomorrow between 11am and 2pm.' },
    { dir: 'in', text: 'Perfect 👍' },
  ],
];

export interface SeedOptions {
  ownerId: string;
  agentId: string;
  now?: Date;
}

export interface SeedData {
  workspace: TablesInsert<'workspaces'>;
  members: TablesInsert<'workspace_members'>[];
  wabaAccount: TablesInsert<'waba_accounts'>;
  phoneNumber: TablesInsert<'phone_numbers'>;
  labels: TablesInsert<'labels'>[];
  contacts: TablesInsert<'contacts'>[];
  contactLabels: TablesInsert<'contact_labels'>[];
  conversations: TablesInsert<'conversations'>[];
  conversationLabels: TablesInsert<'conversation_labels'>[];
  messages: TablesInsert<'messages'>[];
  cannedReplies: TablesInsert<'canned_replies'>[];
  templates: TablesInsert<'message_templates'>[];
  broadcasts: TablesInsert<'broadcasts'>[];
  chatbotFlows: TablesInsert<'chatbot_flows'>[];
}

/** Insert order that satisfies foreign keys. */
export const SEED_INSERT_ORDER = [
  ['workspaces', 'workspace'],
  ['workspace_members', 'members'],
  ['waba_accounts', 'wabaAccount'],
  ['phone_numbers', 'phoneNumber'],
  ['labels', 'labels'],
  ['contacts', 'contacts'],
  ['contact_labels', 'contactLabels'],
  ['message_templates', 'templates'],
  ['conversations', 'conversations'],
  ['conversation_labels', 'conversationLabels'],
  ['messages', 'messages'],
  ['canned_replies', 'cannedReplies'],
  ['broadcasts', 'broadcasts'],
  ['chatbot_flows', 'chatbotFlows'],
] as const satisfies ReadonlyArray<readonly [string, keyof SeedData]>;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export function buildSeedData({ ownerId, agentId, now = new Date() }: SeedOptions): SeedData {
  const ws = SEED_IDS.workspace;
  const iso = (ms: number) => new Date(ms).toISOString();

  const workspace: TablesInsert<'workspaces'> = {
    id: ws,
    name: 'Demo Store',
    slug: 'demo-store',
    timezone: 'Asia/Karachi',
    default_country_code: '92',
    plan: 'pro',
    owner_id: ownerId,
    settings: {
      compliance: {
        optOutKeywords: ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'BAND KARO'],
        optInKeywords: ['START', 'SUBSCRIBE'],
        optOutReply: 'You have been unsubscribed and will no longer receive marketing messages. Reply START to subscribe again.',
        optInReply: 'Welcome back! You are subscribed to updates from Demo Store.',
        dataRetentionDays: 365,
      },
    },
  };

  const members: TablesInsert<'workspace_members'>[] = [
    { id: seedUuid('member', 0), workspace_id: ws, user_id: ownerId, role: 'owner' },
    { id: seedUuid('member', 1), workspace_id: ws, user_id: agentId, role: 'agent', invited_by: ownerId },
  ];

  const wabaAccount: TablesInsert<'waba_accounts'> = {
    id: SEED_IDS.waba,
    workspace_id: ws,
    waba_id: SEED_META.wabaId,
    business_id: '100000000000000',
    name: 'Demo Store WABA',
    currency: 'USD',
    timezone_id: '71',
    message_template_namespace: 'demo_store_namespace',
    account_review_status: 'APPROVED',
    business_verification_status: 'verified',
    access_token_encrypted: null,
    status: 'connected',
    webhook_subscribed: true,
    connected_by: ownerId,
    metadata: { mock: true },
  };

  const phoneNumber: TablesInsert<'phone_numbers'> = {
    id: SEED_IDS.phoneNumber,
    workspace_id: ws,
    waba_account_id: SEED_IDS.waba,
    phone_number_id: SEED_META.phoneNumberId,
    display_phone_number: SEED_META.displayPhoneNumber,
    verified_name: 'Demo Store',
    quality_rating: 'GREEN',
    messaging_limit_tier: 'TIER_1K',
    throughput_level: 'STANDARD',
    code_verification_status: 'VERIFIED',
    name_status: 'APPROVED',
    status: 'CONNECTED',
    is_registered: true,
    is_default: true,
    platform_type: 'CLOUD_API',
    metadata: { mock: true },
  };

  const labels: TablesInsert<'labels'>[] = [
    { id: SEED_IDS.labelVip, workspace_id: ws, name: 'VIP', color: '#F59E0B', description: 'High-value customers' },
    { id: SEED_IDS.labelLead, workspace_id: ws, name: 'New Lead', color: '#10B981', description: 'Interested, not yet purchased' },
  ];

  const contacts: TablesInsert<'contacts'>[] = Array.from({ length: 50 }, (_, i) => {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? 'Customer';
    const last = LAST_NAMES[(i * 7) % LAST_NAMES.length] ?? '';
    const prefix = MOBILE_PREFIXES[i % MOBILE_PREFIXES.length] ?? '300';
    const subscriber = String((1_234_567 + i * 7_919) % 10_000_000).padStart(7, '0');
    const optedOut = i === 37 || i === 44;
    return {
      id: seedUuid('contact', i),
      workspace_id: ws,
      wa_id: `92${prefix}${subscriber}`,
      name: `${first} ${last}`.trim(),
      profile_name: first,
      email: i % 3 === 0 ? `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.com` : null,
      custom_fields: {
        city: CITIES[i % CITIES.length] ?? 'Lahore',
        orders: (i * 3) % 11,
        customer_since: iso(now.getTime() - (i + 10) * 24 * HOUR).slice(0, 10),
      },
      source: i % 4 === 0 ? 'import' : 'whatsapp',
      opted_out: optedOut,
      opted_out_at: optedOut ? iso(now.getTime() - 3 * 24 * HOUR) : null,
      opt_out_reason: optedOut ? 'Replied STOP' : null,
      created_by: ownerId,
    };
  });

  const contactLabels: TablesInsert<'contact_labels'>[] = [];
  contacts.forEach((contact, i) => {
    if (i % 6 === 0) contactLabels.push({ contact_id: contact.id!, label_id: SEED_IDS.labelVip, workspace_id: ws });
    if (i % 4 === 1) contactLabels.push({ contact_id: contact.id!, label_id: SEED_IDS.labelLead, workspace_id: ws });
  });

  const conversations: TablesInsert<'conversations'>[] = [];
  const conversationLabels: TablesInsert<'conversation_labels'>[] = [];
  const messages: TablesInsert<'messages'>[] = [];

  for (let i = 0; i < 20; i += 1) {
    const contact = contacts[i]!;
    const conversationId = seedUuid('conversation', i);
    const script = SCRIPTS[i % SCRIPTS.length]!;
    // Conversation 0–2 are within the 24h window; older ones have expired.
    const start = now.getTime() - (i * 7 + 1) * HOUR - 30 * MINUTE;
    const agent = i % 3 === 0 ? agentId : i % 3 === 1 ? ownerId : null;
    const firstName = (contact.name ?? 'there').split(' ')[0] ?? 'there';

    let lastInbound: number | null = null;
    let firstOutbound: number | null = null;
    let trailingInbound = 0;

    script.forEach((line, m) => {
      const at = start + m * 4 * MINUTE;
      const isLast = m === script.length - 1;
      const inbound = line.dir === 'in';
      if (inbound) {
        lastInbound = at;
        trailingInbound += 1;
      } else {
        firstOutbound ??= at;
        trailingInbound = 0;
      }
      const body = line.text.replace('{{name}}', firstName);
      messages.push({
        id: seedUuid('message', i * 10 + m),
        workspace_id: ws,
        conversation_id: conversationId,
        contact_id: contact.id!,
        phone_number_id: SEED_IDS.phoneNumber,
        wamid: `wamid.SEED${String(i).padStart(2, '0')}${m}`,
        direction: inbound ? 'inbound' : 'outbound',
        type: line.template ? 'template' : 'text',
        status: inbound ? 'received' : isLast ? 'delivered' : 'read',
        sender_type: inbound ? 'contact' : line.template ? 'broadcast' : 'agent',
        sender_id: inbound || line.template ? null : (agent ?? ownerId),
        body,
        content: line.template
          ? { template: { name: 'welcome_offer', language: { code: 'en' } } }
          : { text: { body } },
        template_id: line.template ? SEED_IDS.templateApproved : null,
        pricing_category: inbound ? null : line.template ? 'marketing' : 'service',
        pricing_billable: inbound ? null : Boolean(line.template),
        pricing_model: inbound ? null : 'PMP',
        sent_at: inbound ? null : iso(at),
        delivered_at: inbound ? null : iso(at + 5_000),
        read_at: inbound || isLast ? null : iso(at + 60_000),
        created_at: iso(at),
      });
    });

    const lastLine = script[script.length - 1]!;
    const lastAt = start + (script.length - 1) * 4 * MINUTE;
    const status = i % 5 === 4 ? 'resolved' : i % 7 === 3 ? 'pending' : 'open';

    conversations.push({
      id: conversationId,
      workspace_id: ws,
      contact_id: contact.id!,
      phone_number_id: SEED_IDS.phoneNumber,
      status,
      assigned_to: agent,
      unread_count: lastLine.dir === 'in' && i < 8 && status !== 'resolved' ? trailingInbound : 0,
      last_message_at: iso(lastAt),
      last_message_preview: lastLine.text.replace('{{name}}', firstName).slice(0, 280),
      last_message_direction: lastLine.dir === 'in' ? 'inbound' : 'outbound',
      last_inbound_at: lastInbound ? iso(lastInbound) : null,
      expires_at: lastInbound ? iso((lastInbound as number) + 24 * HOUR) : null,
      category: script.some((l) => l.template) ? 'marketing' : 'service',
      first_response_at: firstOutbound ? iso(firstOutbound) : null,
      awaiting_reply_since: lastLine.dir === 'in' && lastInbound ? iso(lastInbound) : null,
      resolved_at: status === 'resolved' ? iso(lastAt + 10 * MINUTE) : null,
      csat_score: status === 'resolved' ? (i % 2 === 0 ? 5 : 4) : null,
    });

    if (i % 6 === 0) {
      conversationLabels.push({ conversation_id: conversationId, label_id: SEED_IDS.labelVip, workspace_id: ws });
    }
    if (i % 4 === 1) {
      conversationLabels.push({ conversation_id: conversationId, label_id: SEED_IDS.labelLead, workspace_id: ws });
    }
  }

  const cannedReplies: TablesInsert<'canned_replies'>[] = [
    {
      id: seedUuid('canned', 0),
      workspace_id: ws,
      shortcut: 'greet',
      title: 'Greeting',
      body: 'Assalam o Alaikum {{contact.name}}! Thanks for reaching out to Demo Store. How can we help you today?',
      created_by: ownerId,
    },
    {
      id: seedUuid('canned', 1),
      workspace_id: ws,
      shortcut: 'delivery',
      title: 'Delivery info',
      body: 'We deliver nationwide in 2–3 working days. Delivery is free on orders above PKR 3,000.',
      created_by: ownerId,
    },
    {
      id: seedUuid('canned', 2),
      workspace_id: ws,
      shortcut: 'thanks',
      title: 'Thank you',
      body: 'Thank you for shopping with Demo Store! 💜 Let us know if there is anything else we can help with.',
      created_by: ownerId,
    },
  ];

  const templates: TablesInsert<'message_templates'>[] = [
    {
      id: SEED_IDS.templateApproved,
      workspace_id: ws,
      waba_account_id: SEED_IDS.waba,
      meta_template_id: '900000000000001',
      name: 'welcome_offer',
      language: 'en',
      category: 'MARKETING',
      status: 'APPROVED',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'A gift for you 🎁' },
        {
          type: 'BODY',
          text: 'Hi {{1}}, enjoy {{2}} off your next order at Demo Store! Use code {{3}} at checkout.',
          example: { body_text: [['Ayesha', '15%', 'EID15']] },
        },
        { type: 'FOOTER', text: 'Reply STOP to unsubscribe' },
        {
          type: 'BUTTONS',
          buttons: [
            { type: 'QUICK_REPLY', text: 'Shop now' },
            { type: 'QUICK_REPLY', text: 'Not interested' },
          ],
        },
      ] satisfies Json,
      submitted_at: iso(now.getTime() - 10 * 24 * HOUR),
      approved_at: iso(now.getTime() - 9 * 24 * HOUR),
      created_by: ownerId,
    },
    {
      id: SEED_IDS.templatePending,
      workspace_id: ws,
      waba_account_id: SEED_IDS.waba,
      meta_template_id: '900000000000002',
      name: 'order_update',
      language: 'en',
      category: 'UTILITY',
      status: 'PENDING',
      components: [
        {
          type: 'BODY',
          text: 'Hi {{1}}, your order {{2}} has been shipped and will arrive by {{3}}.',
          example: { body_text: [['Ali', 'TZ-1042', 'Friday']] },
        },
        {
          type: 'BUTTONS',
          buttons: [
            {
              type: 'URL',
              text: 'Track order',
              url: 'https://demo.talkzi.app/track/{{1}}',
              example: ['https://demo.talkzi.app/track/TZ-1042'],
            },
          ],
        },
      ] satisfies Json,
      submitted_at: iso(now.getTime() - 2 * HOUR),
      created_by: ownerId,
    },
    {
      id: SEED_IDS.templateRejected,
      workspace_id: ws,
      waba_account_id: SEED_IDS.waba,
      meta_template_id: '900000000000003',
      name: 'cart_reminder',
      language: 'en',
      category: 'MARKETING',
      status: 'REJECTED',
      rejected_reason: 'INVALID_FORMAT',
      components: [
        {
          type: 'BODY',
          text: '{{1}}, you left something in your cart. Complete your order now!',
          example: { body_text: [['Ayesha']] },
        },
      ] satisfies Json,
      submitted_at: iso(now.getTime() - 5 * 24 * HOUR),
      created_by: ownerId,
    },
  ];

  const broadcasts: TablesInsert<'broadcasts'>[] = [
    {
      id: SEED_IDS.broadcast,
      workspace_id: ws,
      name: 'Eid Sale Announcement',
      phone_number_id: SEED_IDS.phoneNumber,
      template_id: SEED_IDS.templateApproved,
      template_name: 'welcome_offer',
      template_language: 'en',
      variable_mapping: {
        body: [
          { source: 'contact.name', fallback: 'there' },
          { source: 'static', value: '20%' },
          { source: 'static', value: 'EID20' },
        ],
      },
      audience: { type: 'labels', labelIds: [SEED_IDS.labelVip], excludeLabelIds: [] },
      status: 'draft',
      created_by: ownerId,
    },
  ];

  const chatbotFlows: TablesInsert<'chatbot_flows'>[] = [
    {
      id: SEED_IDS.chatbotFlow,
      workspace_id: ws,
      name: 'Welcome & lead capture',
      description: 'Greets new chats, captures the customer name and routes to sales or a human agent.',
      status: 'active',
      trigger: { type: 'keyword', keywords: ['hi', 'hello', 'salam', 'menu'], match: 'exact' },
      graph: {
        nodes: [
          { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
          {
            id: 'welcome',
            type: 'message',
            position: { x: 0, y: 120 },
            data: { text: 'Assalam o Alaikum! 👋 Welcome to Demo Store.' },
          },
          {
            id: 'ask-name',
            type: 'ask',
            position: { x: 0, y: 240 },
            data: { question: "What's your name?", variable: 'name', validation: 'none' },
          },
          {
            id: 'ask-topic',
            type: 'ask',
            position: { x: 0, y: 360 },
            data: {
              question: 'Hi {{vars.name}}! How can we help you today?',
              variable: 'topic',
              validation: 'none',
              options: [
                { id: 'order', title: 'Order status' },
                { id: 'new', title: 'New order' },
                { id: 'agent', title: 'Talk to agent' },
              ],
            },
          },
          {
            id: 'is-agent',
            type: 'condition',
            position: { x: 0, y: 480 },
            data: { variable: 'vars.topic', operator: 'equals', value: 'agent' },
          },
          {
            id: 'handoff',
            type: 'assign',
            position: { x: -220, y: 620 },
            data: { assignTo: 'unassigned', note: 'Customer asked for a human agent' },
          },
          {
            id: 'thanks',
            type: 'message',
            position: { x: 220, y: 620 },
            data: { text: 'Thanks {{vars.name}}! Our team will get back to you shortly. 💜' },
          },
          { id: 'end', type: 'end', position: { x: 220, y: 740 }, data: {} },
        ],
        edges: [
          { id: 'e-start-welcome', source: 'start', target: 'welcome' },
          { id: 'e-welcome-name', source: 'welcome', target: 'ask-name' },
          { id: 'e-name-topic', source: 'ask-name', target: 'ask-topic' },
          { id: 'e-topic-cond', source: 'ask-topic', target: 'is-agent' },
          { id: 'e-cond-true', source: 'is-agent', sourceHandle: 'true', target: 'handoff' },
          { id: 'e-cond-false', source: 'is-agent', sourceHandle: 'false', target: 'thanks' },
          { id: 'e-thanks-end', source: 'thanks', target: 'end' },
        ],
      },
      phone_number_id: null,
      priority: 10,
      published_at: iso(now.getTime() - 24 * HOUR),
      created_by: ownerId,
    },
  ];

  return {
    workspace,
    members,
    wabaAccount,
    phoneNumber,
    labels,
    contacts,
    contactLabels,
    conversations,
    conversationLabels,
    messages,
    cannedReplies,
    templates,
    broadcasts,
    chatbotFlows,
  };
}
