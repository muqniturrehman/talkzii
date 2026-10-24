import type { FlowGraph } from '@talkzi/shared';

/** Graph for a new flow: Start → greeting → menu → hand off / thank you. */
export function starterGraph(businessName: string): FlowGraph {
  return {
    nodes: [
      { id: 'start', type: 'start', position: { x: 0, y: 0 }, data: { label: 'Start' } },
      { id: 'welcome', type: 'message', position: { x: 0, y: 130 }, data: { text: `Hi {{contact.first_name}}! 👋 Welcome to ${businessName}.` } },
      {
        id: 'menu',
        type: 'buttons',
        position: { x: 0, y: 260 },
        data: {
          text: 'How can we help you today?',
          buttons: [
            { id: 'browse', title: 'Browse products' },
            { id: 'agent', title: 'Talk to a person' },
          ],
        },
      },
      { id: 'browse-reply', type: 'message', position: { x: -220, y: 420 }, data: { text: 'Here is our catalogue: https://example.com/shop 🛍️' } },
      { id: 'handoff', type: 'assign', position: { x: 220, y: 420 }, data: { assignTo: 'unassigned', note: 'Customer asked for a person' } },
      { id: 'end', type: 'end', position: { x: -220, y: 560 }, data: {} },
    ],
    edges: [
      { id: 'e1', source: 'start', target: 'welcome' },
      { id: 'e2', source: 'welcome', target: 'menu' },
      { id: 'e3', source: 'menu', sourceHandle: 'browse', target: 'browse-reply' },
      { id: 'e4', source: 'menu', sourceHandle: 'agent', target: 'handoff' },
      { id: 'e5', source: 'browse-reply', target: 'end' },
    ],
  };
}
