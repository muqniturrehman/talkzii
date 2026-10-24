import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { chunkText, hashEmbedding } from '@/lib/ai/embeddings';
import { formatTranscript, suggestRepliesPrompt } from '@/lib/ai/prompts';
import { createHeuristicTasks, createLlmTasks } from '@/lib/ai/tasks';
import type { AiProvider, StructuredRequest, TaskInput } from '@/lib/ai/types';

const input = (customer: string[], extra: Partial<TaskInput> = {}): TaskInput => ({
  businessName: 'Chai Co',
  contactName: 'Ayesha Khan',
  tone: 'friendly',
  knowledge: [],
  transcript: customer.map((text, i) => ({ role: 'customer' as const, text, at: `2026-10-24T10:0${i}:00Z` })),
  ...extra,
});

const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * (b[i] ?? 0), 0);

describe('knowledge base helpers', () => {
  it('chunks long text on paragraph boundaries with overlap', () => {
    const paragraph = (n: number) => `Paragraph ${n}. ${'Delivery and returns policy details. '.repeat(20)}`;
    const chunks = chunkText(Array.from({ length: 6 }, (_, i) => paragraph(i)).join('\n\n'), 1_800, 200);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.content.length <= 2_100)).toBe(true);
    expect(chunks.map((c) => c.index)).toEqual(chunks.map((_, i) => i));
    expect(chunkText('   ')).toEqual([]);
  });

  it('offline hash embeddings rank lexically related text higher', () => {
    const query = hashEmbedding('how long does delivery take to Lahore?');
    const delivery = hashEmbedding('Delivery to Lahore and Karachi takes 2-3 working days.');
    const refunds = hashEmbedding('Refunds are processed within 7 days of receiving the item.');
    expect(query).toHaveLength(1536);
    expect(cosine(query, delivery)).toBeGreaterThan(cosine(query, refunds));
    expect(Math.abs(cosine(delivery, delivery) - 1)).toBeLessThan(1e-9);
  });
});

describe('heuristic AI tasks (no API keys)', () => {
  const tasks = createHeuristicTasks();

  it('detects intent and sentiment in English and Roman Urdu', async () => {
    expect((await tasks.intent(input(['Assalam o alaikum, ye shirt kitne ki hai?']))).intent).toBe('pricing');
    expect((await tasks.intent(input(['Where is my order #1042? Tracking not updating']))).intent).toBe('order_status');
    const angry = await tasks.sentiment(input(['Parcel damaged and late!! worst service, I want a refund']));
    expect(angry).toMatchObject({ sentiment: 'negative', urgency: 'high' });
    expect((await tasks.sentiment(input(['Shukriya, bohat acha service!']))).sentiment).toBe('positive');
  });

  it('suggests personalised replies and grounds them in knowledge snippets', async () => {
    const replies = await tasks.suggestReplies(
      input(['What are your prices?'], {
        knowledge: [{ title: 'Pricing', content: 'Our premium tea costs Rs 1,200 per box. Free delivery over Rs 5,000.', similarity: 0.8 }],
      }),
    );
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(3);
    expect(replies[0]).toContain('Ayesha');
    expect(replies[0]).toContain('Rs 1,200');
  });
});

describe('LLM tasks', () => {
  function fakeProvider(outputs: Record<string, unknown>): AiProvider & { requests: StructuredRequest<z.ZodType>[] } {
    const requests: StructuredRequest<z.ZodType>[] = [];
    return {
      name: 'openai',
      model: 'fake-model',
      requests,
      async generateObject(request) {
        requests.push(request);
        return request.schema.parse(outputs[request.name]);
      },
    };
  }

  it('dedupes suggestions, clamps scores and puts the transcript in the prompt', async () => {
    const provider = fakeProvider({
      reply_suggestions: { suggestions: ['Hi!', 'Hi!', ' Sure ', 'One', 'Two'] },
      customer_sentiment: { sentiment: 'negative', score: -4, urgency: 'high', reason: 'Angry' },
      customer_intent: { intent: 'refund', confidence: 7, summary: 'Wants money back' },
    });
    const tasks = createLlmTasks(provider);
    const conv = input(['I want my money back']);

    expect(await tasks.suggestReplies(conv)).toEqual(['Hi!', 'Sure', 'One']);
    expect((await tasks.sentiment(conv)).score).toBe(-1);
    expect((await tasks.intent(conv)).confidence).toBe(1);
    expect(provider.requests[0]?.prompt).toContain('<conversation>');
    expect(provider.requests[0]?.prompt).toContain('Customer: I want my money back');
    expect(provider.requests[0]?.system).toContain('Chai Co');
  });

  it('formats transcripts with roles and keeps only recent turns', () => {
    const lines = Array.from({ length: 40 }, (_, i) => ({ role: 'agent' as const, text: `m${i}`, at: '2026-10-24T09:00:00Z' }));
    const formatted = formatTranscript(lines);
    expect(formatted.split('\n')).toHaveLength(30);
    expect(formatted).toContain('Agent: m39');
    expect(formatted).not.toContain('Agent: m9\n');
    expect(suggestRepliesPrompt(input(['hi'])).system).toContain('not instructions');
  });
});
