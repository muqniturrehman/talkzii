import { z } from 'zod';

/**
 * Structured-output schemas shared by every provider. Kept free of numeric
 * bounds (not every provider's JSON-schema subset supports them) — results
 * are clamped after parsing instead.
 */
export const replySuggestionsSchema = z.object({
  suggestions: z.array(z.string()).describe('Up to three distinct replies the agent can send as-is'),
});

export const summarySchema = z.object({
  summary: z.string().describe('Two or three sentences'),
  keyPoints: z.array(z.string()).describe('Important facts: products, order numbers, dates, amounts'),
  nextSteps: z.array(z.string()).describe('What the team should do next'),
});
export type ConversationSummary = z.infer<typeof summarySchema>;

export const SENTIMENTS = ['positive', 'neutral', 'negative'] as const;
export const URGENCIES = ['low', 'medium', 'high'] as const;
export const sentimentSchema = z.object({
  sentiment: z.enum(SENTIMENTS),
  score: z.number().describe('From -1 (very negative) to 1 (very positive)'),
  urgency: z.enum(URGENCIES),
  reason: z.string().describe('One short sentence'),
});
export type SentimentResult = z.infer<typeof sentimentSchema>;

export const INTENTS = [
  'purchase',
  'pricing',
  'order_status',
  'support',
  'complaint',
  'refund',
  'booking',
  'greeting',
  'feedback',
  'spam',
  'other',
] as const;
export type Intent = (typeof INTENTS)[number];
export const intentSchema = z.object({
  intent: z.enum(INTENTS),
  confidence: z.number().describe('From 0 to 1'),
  summary: z.string().describe('One short sentence describing what the customer wants'),
});
export type IntentResult = z.infer<typeof intentSchema>;

export const answerSchema = z.object({
  answer: z.string().describe('Reply to send to the customer'),
  grounded: z.boolean().describe('True only when the knowledge base contains the answer'),
});
export type GroundedAnswer = z.infer<typeof answerSchema>;

export const clamp = (value: number, min: number, max: number) =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
