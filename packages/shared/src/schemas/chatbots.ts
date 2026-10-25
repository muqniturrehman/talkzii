import { z } from 'zod';

/** Node kinds available in the flow builder. */
export const CHATBOT_NODE_TYPES = [
  'start',
  'message',
  'ask',
  'buttons',
  'condition',
  'set_variable',
  'label',
  'assign',
  'ai_reply',
  'http_request',
  'send_template',
  'end',
] as const;
export type ChatbotNodeType = (typeof CHATBOT_NODE_TYPES)[number];

export const CONDITION_OPERATORS = ['equals', 'not_equals', 'contains', 'starts_with', 'greater_than', 'less_than', 'is_set', 'is_not_set'] as const;
export type ConditionOperator = (typeof CONDITION_OPERATORS)[number];

const optionSchema = z.object({ id: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(24) });
const variableName = z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'lowercase letters, numbers and _');

export const nodeDataSchemas = {
  start: z.object({ label: z.string().optional() }).passthrough(),
  message: z.object({ text: z.string().trim().min(1).max(4096) }),
  ask: z.object({
    question: z.string().trim().min(1).max(1024),
    variable: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'lowercase letters, numbers and _'),
    validation: z.enum(['none', 'email', 'phone', 'number']).default('none'),
    options: z.array(optionSchema).max(10).optional(),
    errorMessage: z.string().max(500).optional(),
  }),
  buttons: z.object({
    text: z.string().trim().min(1).max(1024),
    buttons: z.array(z.object({ id: z.string().trim().min(1).max(64), title: z.string().trim().min(1).max(20) })).min(1).max(3),
  }),
  condition: z.object({
    variable: z.string().trim().min(1).max(80),
    operator: z.enum(CONDITION_OPERATORS),
    value: z.string().max(200).default(''),
  }),
  set_variable: z.object({
    variable: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, 'lowercase letters, numbers and _'),
    value: z.string().max(1000),
  }),
  label: z.object({ labelId: z.uuid() }),
  assign: z.object({ assignTo: z.union([z.literal('unassigned'), z.uuid()]).default('unassigned'), note: z.string().max(500).optional() }),
  ai_reply: z.object({ fallback: z.string().max(1000).default('Let me connect you with our team.') }),
  /** Calls your API; {{variables}} work in the URL, headers and JSON body. */
  http_request: z.object({
    method: z.enum(['GET', 'POST']).default('POST'),
    url: z.string().trim().max(2000).regex(/^https?:\/\/\S+$/, 'Enter a full URL starting with https://'),
    headers: z
      .array(z.object({ key: z.string().trim().regex(/^[A-Za-z0-9-]{1,64}$/, 'Header names use letters, numbers and -'), value: z.string().max(1000) }))
      .max(10)
      .default([]),
    body: z.string().max(5000).optional(),
    /** Save the response (or one field of it) as {{vars.<saveAs>}}. */
    saveAs: variableName.optional(),
    /** Dot path into a JSON response, e.g. "order.status". */
    responsePath: z.string().trim().max(120).optional(),
  }),
  /** Sends an approved template; works outside the 24-hour window. */
  send_template: z.object({
    templateId: z.uuid('Choose an approved template'),
    templateName: z.string().max(512).optional(),
    /** Body variables {{1}}, {{2}}…, each may use {{contact.*}} / {{vars.*}}. */
    variables: z.array(z.string().max(1024)).max(20).default([]),
  }),
  end: z.object({ text: z.string().max(1024).optional() }).passthrough(),
} satisfies Record<ChatbotNodeType, z.ZodType>;

export const flowNodeSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(CHATBOT_NODE_TYPES),
  position: z.object({ x: z.number(), y: z.number() }),
  data: z.record(z.string(), z.unknown()).default({}),
});
export type FlowNode = z.infer<typeof flowNodeSchema>;

export const flowEdgeSchema = z.object({
  id: z.string().min(1).max(128),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
});
export type FlowEdge = z.infer<typeof flowEdgeSchema>;

export const flowGraphSchema = z.object({
  nodes: z.array(flowNodeSchema).max(200),
  edges: z.array(flowEdgeSchema).max(400),
});
export type FlowGraph = z.infer<typeof flowGraphSchema>;

export const chatbotTriggerSchema = z.object({
  type: z.enum(['keyword', 'any_message', 'first_message']),
  keywords: z.array(z.string().trim().min(1).max(60)).max(30).default([]),
  match: z.enum(['exact', 'contains']).default('exact'),
});
export type ChatbotTrigger = z.infer<typeof chatbotTriggerSchema>;

export const saveChatbotSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().max(500).optional(),
  trigger: chatbotTriggerSchema,
  graph: flowGraphSchema,
  phoneNumberId: z.uuid().nullable().optional(),
  priority: z.number().int().min(0).max(100).default(0),
});
export type SaveChatbotInput = z.infer<typeof saveChatbotSchema>;

export const createChatbotSchema = z.object({ name: z.string().trim().min(1).max(120) });

export const chatbotStatusSchema = z.object({ status: z.enum(['active', 'inactive', 'draft']) });

export const executeChatbotSchema = z.object({
  /** What the simulated customer sends. */
  text: z.string().max(4096).default(''),
  buttonId: z.string().max(64).optional(),
  /** Session state returned by the previous call (simulator keeps it client-side). */
  state: z
    .object({
      currentNodeId: z.string().nullable(),
      variables: z.record(z.string(), z.string()),
      status: z.enum(['active', 'waiting', 'completed', 'handed_off', 'failed']),
      stepCount: z.number().int().min(0),
    })
    .nullable()
    .default(null),
  /** Unsaved graph from the builder (falls back to the stored one). */
  graph: flowGraphSchema.optional(),
});

/** Structural checks run before a flow can be activated. */
export function validateFlowGraph(graph: FlowGraph): string[] {
  const errors: string[] = [];
  const ids = new Set(graph.nodes.map((n) => n.id));
  const starts = graph.nodes.filter((n) => n.type === 'start');
  if (starts.length !== 1) errors.push('A flow needs exactly one Start node.');
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) errors.push(`Connection ${edge.id} points to a missing node.`);
  }
  const outgoing = (id: string) => graph.edges.filter((e) => e.source === id);
  if (starts[0] && outgoing(starts[0].id).length === 0) errors.push('Connect the Start node to the first step.');

  for (const node of graph.nodes) {
    const schema = nodeDataSchemas[node.type];
    const parsed = schema.safeParse(node.data);
    if (!parsed.success) {
      errors.push(`${node.type} step “${node.id}”: ${parsed.error.issues[0]?.message ?? 'invalid settings'}`);
      continue;
    }
    if (node.type === 'condition') {
      const handles = new Set(outgoing(node.id).map((e) => e.sourceHandle));
      if (!handles.has('true') || !handles.has('false')) errors.push(`Condition “${node.id}” needs both a Yes and a No path.`);
    }
    if (node.type === 'http_request') {
      const handles = new Set(outgoing(node.id).map((e) => e.sourceHandle));
      if (!handles.has('success')) errors.push(`HTTP request “${node.id}” needs a Success path.`);
    }
    if (node.type === 'buttons') {
      const data = parsed.data as z.infer<(typeof nodeDataSchemas)['buttons']>;
      const handles = new Set(outgoing(node.id).map((e) => e.sourceHandle));
      for (const b of data.buttons) if (!handles.has(b.id)) errors.push(`Button “${b.title}” in “${node.id}” isn’t connected.`);
    }
  }
  return [...new Set(errors)];
}
