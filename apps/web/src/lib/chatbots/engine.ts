import { nodeDataSchemas, normalizePhone, type ChatbotTrigger, type FlowGraph, type FlowNode } from '@talkzi/shared';
import type { z } from 'zod';

export type SessionStatus = 'active' | 'waiting' | 'completed' | 'handed_off' | 'failed';

export interface SessionState {
  currentNodeId: string | null;
  variables: Record<string, string>;
  status: SessionStatus;
  stepCount: number;
}

export interface EngineContact {
  name: string | null;
  profile_name: string | null;
  wa_id: string;
  custom_fields: unknown;
}

export interface InboundInput {
  text: string | null;
  /** Interactive reply id (button or list row), when the customer tapped one. */
  replyId?: string | null;
}

/** Side effects the engine asks for; implemented by the live sender and the simulator. */
export interface EngineActions {
  sendText(text: string): Promise<void>;
  sendButtons(text: string, buttons: { id: string; title: string }[]): Promise<void>;
  sendList(text: string, buttonText: string, rows: { id: string; title: string }[]): Promise<void>;
  /** Hand the conversation to a human (pauses the bot). */
  handoff(assignTo: string | null, note?: string): Promise<void>;
  addLabel(labelId: string): Promise<void>;
  /** Knowledge-base answer to the customer's message, or null. */
  aiReply(question: string): Promise<string | null>;
  /** Calls an external API (SSRF-guarded); never throws. */
  httpRequest(request: FlowHttpRequest): Promise<FlowHttpResponse>;
  /** Sends an approved template with body variables. */
  sendTemplate(templateId: string, variables: string[]): Promise<void>;
}

export interface FlowHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FlowHttpResponse {
  ok: boolean;
  status: number | null;
  body: string;
}

export const MAX_STEPS_PER_RUN = 25;
const MAX_RETRIES = 2;

type Data<T extends keyof typeof nodeDataSchemas> = z.output<(typeof nodeDataSchemas)[T]>;

function parseData<T extends keyof typeof nodeDataSchemas>(type: T, node: FlowNode): Data<T> | null {
  const parsed = nodeDataSchemas[type].safeParse(node.data);
  return parsed.success ? (parsed.data as Data<T>) : null;
}

/**
 * {{vars.x}}, {{contact.name}}, {{contact.first_name}}, {{contact.phone}}, {{contact.custom.key}}.
 * `escape` transforms substituted values (e.g. JSON-escaping inside a request body).
 */
export function interpolate(text: string, vars: Record<string, string>, contact: EngineContact, escape: (value: string) => string = (v) => v): string {
  const fullName = (contact.name ?? contact.profile_name ?? '').trim();
  const custom = (contact.custom_fields && typeof contact.custom_fields === 'object' ? contact.custom_fields : {}) as Record<string, unknown>;
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path: string) => {
    if (path.startsWith('vars.')) return escape(vars[path.slice(5)] ?? '');
    switch (path) {
      case 'contact.name':
        return escape(fullName || 'there');
      case 'contact.first_name':
        return escape(fullName.split(/\s+/)[0] || 'there');
      case 'contact.phone':
        return escape(`+${contact.wa_id}`);
      default:
        if (path.startsWith('contact.custom.')) {
          const value = custom[path.slice('contact.custom.'.length)];
          return escape(value === undefined || value === null ? '' : String(value));
        }
        return match;
    }
  });
}

/** Escapes a value for use inside a JSON string literal. */
export const jsonEscape = (value: string) => JSON.stringify(value).slice(1, -1);

/** A response field by dot path ("order.items.0.name"), or the raw body. */
export function pickResponseValue(body: string, path?: string): string {
  if (!path) return body;
  try {
    let value: unknown = JSON.parse(body);
    for (const part of path.split('.')) {
      if (value === null || typeof value !== 'object') return '';
      value = Array.isArray(value) ? value[Number(part)] : (value as Record<string, unknown>)[part];
    }
    if (value === undefined || value === null) return '';
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
  } catch {
    return '';
  }
}

function resolveValue(path: string, vars: Record<string, string>, contact: EngineContact): string {
  if (path.includes('{{')) return interpolate(path, vars, contact);
  return interpolate(`{{${path.trim()}}}`, vars, contact);
}

export function evaluateCondition(data: Data<'condition'>, vars: Record<string, string>, contact: EngineContact): boolean {
  const actual = resolveValue(data.variable, vars, contact).trim();
  const expected = data.value.trim();
  const a = actual.toLowerCase();
  const e = expected.toLowerCase();
  switch (data.operator) {
    case 'equals':
      return a === e;
    case 'not_equals':
      return a !== e;
    case 'contains':
      return a.includes(e);
    case 'starts_with':
      return a.startsWith(e);
    case 'greater_than':
      return Number(actual) > Number(expected);
    case 'less_than':
      return Number(actual) < Number(expected);
    case 'is_set':
      return actual.length > 0;
    case 'is_not_set':
      return actual.length === 0;
  }
}

function validateAnswer(kind: Data<'ask'>['validation'], value: string): string | null {
  switch (kind) {
    case 'email':
      return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ? value.toLowerCase() : null;
    case 'phone':
      return normalizePhone(value);
    case 'number': {
      const n = Number(value.replace(/,/g, ''));
      return Number.isFinite(n) ? String(n) : null;
    }
    default:
      return value || null;
  }
}

/** Does this inbound text start the flow? */
export function matchesTrigger(trigger: ChatbotTrigger, text: string | null, isFirstMessage: boolean): boolean {
  switch (trigger.type) {
    case 'any_message':
      return true;
    case 'first_message':
      return isFirstMessage;
    case 'keyword': {
      const input = (text ?? '').trim().toLowerCase();
      if (!input) return false;
      return trigger.keywords.some((k) => {
        const keyword = k.trim().toLowerCase();
        return trigger.match === 'contains' ? input.includes(keyword) : input === keyword;
      });
    }
  }
}

/**
 * Advances a flow for one inbound message: consumes the answer to a waiting
 * ask/buttons step, then executes steps until the bot needs input, hands
 * off, ends or hits the step limit (loop protection).
 */
export async function runFlow(
  graph: FlowGraph,
  previous: SessionState | null,
  input: InboundInput,
  contact: EngineContact,
  actions: EngineActions,
): Promise<SessionState> {
  const nodes = new Map(graph.nodes.map((n) => [n.id, n]));
  const nextOf = (id: string, handle?: string | null) =>
    graph.edges.find((e) => e.source === id && (handle === undefined ? true : (e.sourceHandle ?? null) === handle))?.target ?? null;

  const state: SessionState = previous
    ? { ...previous, variables: { ...previous.variables } }
    : { currentNodeId: graph.nodes.find((n) => n.type === 'start')?.id ?? null, variables: {}, status: 'active', stepCount: 0 };
  const text = (input.text ?? '').trim();

  // 1. Consume the customer's answer when we were waiting for one.
  if (previous?.status === 'waiting' && state.currentNodeId) {
    const node = nodes.get(state.currentNodeId);
    if (node?.type === 'ask') {
      const data = parseData('ask', node);
      if (!data) return { ...state, status: 'failed' };
      const option = data.options?.find((o) => o.id === input.replyId || o.title.toLowerCase() === text.toLowerCase());
      const value = option ? option.id : validateAnswer(data.validation, text);
      if (value === null) {
        const retries = Number(state.variables.__retries ?? '0') + 1;
        if (retries <= MAX_RETRIES) {
          state.variables.__retries = String(retries);
          await actions.sendText(data.errorMessage ?? 'Sorry, I didn’t get that. Please try again.');
          return state;
        }
      }
      delete state.variables.__retries;
      state.variables[data.variable] = value ?? text;
      state.currentNodeId = nextOf(node.id);
    } else if (node?.type === 'buttons') {
      const data = parseData('buttons', node);
      if (!data) return { ...state, status: 'failed' };
      const button = data.buttons.find((b) => b.id === input.replyId || b.title.toLowerCase() === text.toLowerCase());
      if (!button) {
        await actions.sendButtons(interpolate(data.text, state.variables, contact), data.buttons);
        return state;
      }
      state.variables.last_button = button.id;
      state.currentNodeId = nextOf(node.id, button.id) ?? nextOf(node.id);
    }
    state.status = 'active';
  }

  // 2. Execute steps until input is needed.
  let steps = 0;
  while (state.currentNodeId && steps < MAX_STEPS_PER_RUN) {
    const node = nodes.get(state.currentNodeId);
    if (!node) {
      state.currentNodeId = null;
      break;
    }
    steps++;
    state.stepCount++;
    const vars = state.variables;

    switch (node.type) {
      case 'start':
        state.currentNodeId = nextOf(node.id);
        break;
      case 'message': {
        const data = parseData('message', node);
        if (data) await actions.sendText(interpolate(data.text, vars, contact));
        state.currentNodeId = nextOf(node.id);
        break;
      }
      case 'ask': {
        const data = parseData('ask', node);
        if (!data) return { ...state, status: 'failed' };
        const question = interpolate(data.question, vars, contact);
        const options = data.options ?? [];
        if (options.length > 0 && options.length <= 3) await actions.sendButtons(question, options);
        else if (options.length > 3) await actions.sendList(question, 'Choose', options);
        else await actions.sendText(question);
        return { ...state, status: 'waiting' };
      }
      case 'buttons': {
        const data = parseData('buttons', node);
        if (!data) return { ...state, status: 'failed' };
        await actions.sendButtons(interpolate(data.text, vars, contact), data.buttons);
        return { ...state, status: 'waiting' };
      }
      case 'condition': {
        const data = parseData('condition', node);
        if (!data) return { ...state, status: 'failed' };
        state.currentNodeId = nextOf(node.id, evaluateCondition(data, vars, contact) ? 'true' : 'false');
        break;
      }
      case 'set_variable': {
        const data = parseData('set_variable', node);
        if (data) vars[data.variable] = interpolate(data.value, vars, contact);
        state.currentNodeId = nextOf(node.id);
        break;
      }
      case 'label': {
        const data = parseData('label', node);
        if (data) await actions.addLabel(data.labelId);
        state.currentNodeId = nextOf(node.id);
        break;
      }
      case 'assign': {
        const data = parseData('assign', node);
        await actions.handoff(data && data.assignTo !== 'unassigned' ? data.assignTo : null, data?.note ? interpolate(data.note, vars, contact) : undefined);
        return { ...state, currentNodeId: node.id, status: 'handed_off' };
      }
      case 'ai_reply': {
        const data = parseData('ai_reply', node);
        const answer = text ? await actions.aiReply(text) : null;
        await actions.sendText(answer ?? data?.fallback ?? 'Let me connect you with our team.');
        state.currentNodeId = nextOf(node.id);
        break;
      }
      case 'http_request': {
        const data = parseData('http_request', node);
        if (!data) return { ...state, status: 'failed' };
        const response = await actions.httpRequest({
          method: data.method,
          url: interpolate(data.url, vars, contact, encodeURIComponent),
          headers: Object.fromEntries(data.headers.map((h) => [h.key, interpolate(h.value, vars, contact)])),
          ...(data.method === 'POST' && data.body ? { body: interpolate(data.body, vars, contact, jsonEscape) } : {}),
        });
        vars.http_status = String(response.status ?? 0);
        if (data.saveAs) vars[data.saveAs] = pickResponseValue(response.body, data.responsePath).slice(0, 1000);
        state.currentNodeId = response.ok ? nextOf(node.id, 'success') : (nextOf(node.id, 'error') ?? nextOf(node.id, 'success'));
        break;
      }
      case 'send_template': {
        const data = parseData('send_template', node);
        if (!data) return { ...state, status: 'failed' };
        await actions.sendTemplate(data.templateId, data.variables.map((v) => interpolate(v, vars, contact)));
        state.currentNodeId = nextOf(node.id);
        break;
      }
      case 'end': {
        const data = parseData('end', node);
        if (data?.text) await actions.sendText(interpolate(data.text, vars, contact));
        return { ...state, currentNodeId: null, status: 'completed' };
      }
    }
  }

  if (steps >= MAX_STEPS_PER_RUN && state.currentNodeId) return { ...state, status: 'failed' };
  return { ...state, currentNodeId: null, status: 'completed' };
}
