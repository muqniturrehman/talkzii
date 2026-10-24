import { describe, expect, it } from 'vitest';
import { flowGraphSchema, validateFlowGraph, type FlowGraph } from '@talkzi/shared';
import { buildSeedData } from '@talkzi/db/seed-data';
import { evaluateCondition, interpolate, matchesTrigger, runFlow, MAX_STEPS_PER_RUN, type SessionState } from '@/lib/chatbots/engine';
import { simulatorActions } from '@/lib/chatbots/runtime';
import { starterGraph } from '@/lib/chatbots/starter';

const contact = { name: null, profile_name: 'Ayesha Khan', wa_id: '923001234567', custom_fields: { city: 'Lahore' } };
const seedGraph = flowGraphSchema.parse(buildSeedData({ ownerId: 'owner', agentId: 'agent' }).chatbotFlows[0]!.graph);

async function turn(graph: FlowGraph, state: SessionState | null, text: string, replyId?: string) {
  const actions = simulatorActions();
  const next = await runFlow(graph, state, { text, replyId }, contact, actions);
  return { next, messages: actions.messages };
}

describe('chatbot execute (simulator)', () => {
  it('runs the seeded demo flow: welcome → ask name → menu → thank-you', async () => {
    const t1 = await turn(seedGraph, null, 'hi');
    expect(t1.messages).toEqual([
      { kind: 'text', text: 'Assalam o Alaikum! 👋 Welcome to Demo Store.' },
      { kind: 'text', text: "What's your name?" },
    ]);
    expect(t1.next).toMatchObject({ status: 'waiting', currentNodeId: 'ask-name' });

    const t2 = await turn(seedGraph, t1.next, 'Ayesha');
    expect(t2.next.variables.name).toBe('Ayesha');
    expect(t2.messages).toEqual([
      {
        kind: 'buttons',
        text: 'Hi Ayesha! How can we help you today?',
        buttons: [
          { id: 'order', title: 'Order status' },
          { id: 'new', title: 'New order' },
          { id: 'agent', title: 'Talk to agent' },
        ],
      },
    ]);

    const t3 = await turn(seedGraph, t2.next, 'Order status', 'order');
    expect(t3.next).toMatchObject({ status: 'completed', currentNodeId: null });
    expect(t3.next.variables.topic).toBe('order');
    expect(t3.messages).toEqual([{ kind: 'text', text: 'Thanks Ayesha! Our team will get back to you shortly. 💜' }]);
  });

  it('hands off to a human when the customer taps "Talk to agent"', async () => {
    const t1 = await turn(seedGraph, null, 'hi');
    const t2 = await turn(seedGraph, t1.next, 'Bilal');
    const t3 = await turn(seedGraph, t2.next, 'Talk to agent', 'agent');
    expect(t3.next).toMatchObject({ status: 'handed_off', currentNodeId: 'handoff' });
    expect(t3.messages).toEqual([{ kind: 'handoff', note: 'Customer asked for a human agent' }]);
  });

  it('re-asks on invalid answers, then moves on after two retries', async () => {
    const graph: FlowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: {} },
        { id: 'email', type: 'ask', position: { x: 0, y: 1 }, data: { question: 'Your email?', variable: 'email', validation: 'email', errorMessage: 'That email looks wrong.' } },
        { id: 'done', type: 'message', position: { x: 0, y: 2 }, data: { text: 'Saved {{vars.email}} for {{contact.first_name}} in {{contact.custom.city}}' } },
      ],
      edges: [
        { id: 'a', source: 's', target: 'email' },
        { id: 'b', source: 'email', target: 'done' },
      ],
    };
    const t1 = await turn(graph, null, 'start');
    const bad1 = await turn(graph, t1.next, 'nope');
    expect(bad1.messages).toEqual([{ kind: 'text', text: 'That email looks wrong.' }]);
    expect(bad1.next.status).toBe('waiting');
    const good = await turn(graph, bad1.next, 'AYESHA@Example.com');
    expect(good.messages).toEqual([{ kind: 'text', text: 'Saved ayesha@example.com for Ayesha in Lahore' }]);
    expect(good.next.status).toBe('completed');

    const bad2 = await turn(graph, bad1.next, 'still wrong');
    const giveUp = await turn(graph, bad2.next, 'wrong again');
    expect(giveUp.next.status).toBe('completed');
  });

  it('routes buttons by id and resends them for unknown replies', async () => {
    const graph = starterGraph('Chai Co');
    const t1 = await turn(graph, null, 'hello');
    expect(t1.messages.map((m) => m.kind)).toEqual(['text', 'buttons']);
    const unknown = await turn(graph, t1.next, 'what?');
    expect(unknown.messages).toEqual([expect.objectContaining({ kind: 'buttons' })]);
    expect(unknown.next.status).toBe('waiting');
    const browse = await turn(graph, t1.next, 'Browse products', 'browse');
    expect(browse.messages[0]).toEqual({ kind: 'text', text: 'Here is our catalogue: https://example.com/shop 🛍️' });
    expect(browse.next.status).toBe('completed');
  });

  it('stops runaway loops', async () => {
    const graph: FlowGraph = {
      nodes: [
        { id: 's', type: 'start', position: { x: 0, y: 0 }, data: {} },
        { id: 'a', type: 'set_variable', position: { x: 0, y: 1 }, data: { variable: 'n', value: 'x' } },
      ],
      edges: [
        { id: 'e1', source: 's', target: 'a' },
        { id: 'e2', source: 'a', target: 'a' },
      ],
    };
    const { next } = await turn(graph, null, 'hi');
    expect(next.status).toBe('failed');
    expect(next.stepCount).toBe(MAX_STEPS_PER_RUN);
  });
});

describe('chatbot helpers', () => {
  it('matches keyword, any-message and first-message triggers', () => {
    expect(matchesTrigger({ type: 'keyword', keywords: ['Salam', 'menu'], match: 'exact' }, '  salam ', false)).toBe(true);
    expect(matchesTrigger({ type: 'keyword', keywords: ['menu'], match: 'exact' }, 'show menu', false)).toBe(false);
    expect(matchesTrigger({ type: 'keyword', keywords: ['menu'], match: 'contains' }, 'show menu please', false)).toBe(true);
    expect(matchesTrigger({ type: 'first_message', keywords: [], match: 'exact' }, 'anything', true)).toBe(true);
    expect(matchesTrigger({ type: 'first_message', keywords: [], match: 'exact' }, 'anything', false)).toBe(false);
    expect(matchesTrigger({ type: 'any_message', keywords: [], match: 'exact' }, null, false)).toBe(true);
  });

  it('evaluates conditions and interpolates variables', () => {
    const vars = { total: '1500', city: 'Lahore' };
    expect(evaluateCondition({ variable: 'vars.total', operator: 'greater_than', value: '1000' }, vars, contact)).toBe(true);
    expect(evaluateCondition({ variable: 'contact.custom.city', operator: 'equals', value: 'lahore' }, vars, contact)).toBe(true);
    expect(evaluateCondition({ variable: 'vars.missing', operator: 'is_not_set', value: '' }, vars, contact)).toBe(true);
    expect(interpolate('{{contact.name}} · {{contact.phone}} · {{vars.city}} · {{unknown}}', vars, contact)).toBe('Ayesha Khan · +923001234567 · Lahore · {{unknown}}');
  });

  it('validates flow structure before activation', () => {
    expect(validateFlowGraph(seedGraph)).toEqual([]);
    expect(validateFlowGraph(starterGraph('X'))).toEqual([]);
    const broken: FlowGraph = {
      nodes: [
        { id: 'c', type: 'condition', position: { x: 0, y: 0 }, data: { variable: 'vars.x', operator: 'equals', value: '1' } },
        { id: 'b', type: 'buttons', position: { x: 0, y: 1 }, data: { text: 'Pick', buttons: [{ id: 'yes', title: 'Yes' }] } },
      ],
      edges: [{ id: 'e', source: 'c', sourceHandle: 'true', target: 'b' }],
    };
    expect(validateFlowGraph(broken)).toEqual([
      'A flow needs exactly one Start node.',
      'Condition “c” needs both a Yes and a No path.',
      'Button “Yes” in “b” isn’t connected.',
    ]);
  });
});
