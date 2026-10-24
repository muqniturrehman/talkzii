import type { z } from 'zod';
import type { AiSettings } from '@talkzi/shared';
import type { ConversationSummary, IntentResult, SentimentResult } from './schemas';

export type AiProviderName = 'openai' | 'anthropic' | 'heuristic';

export interface TranscriptLine {
  role: 'customer' | 'agent' | 'bot';
  text: string;
  at: string;
}

export interface KnowledgeSnippet {
  title: string;
  content: string;
  similarity: number;
}

/** Everything a task needs about one conversation. */
export interface TaskInput {
  businessName: string;
  contactName: string | null;
  tone: AiSettings['tone'];
  transcript: TranscriptLine[];
  knowledge: KnowledgeSnippet[];
}

export interface StructuredRequest<S extends z.ZodType> {
  system: string;
  prompt: string;
  schema: S;
  /** Schema name (letters, digits, underscores). */
  name: string;
  maxTokens?: number;
}

/** A model that can return JSON matching a Zod schema. */
export interface AiProvider {
  readonly name: Exclude<AiProviderName, 'heuristic'>;
  readonly model: string;
  generateObject<S extends z.ZodType>(request: StructuredRequest<S>): Promise<z.output<S>>;
}

/** The inbox AI features, backed by an LLM or by offline heuristics. */
export interface AiTasks {
  readonly provider: AiProviderName;
  readonly model: string;
  suggestReplies(input: TaskInput): Promise<string[]>;
  summarize(input: TaskInput): Promise<ConversationSummary>;
  sentiment(input: TaskInput): Promise<SentimentResult>;
  intent(input: TaskInput): Promise<IntentResult>;
}

export type AiErrorCode = 'AUTH' | 'RATE_LIMITED' | 'REFUSED' | 'BAD_OUTPUT' | 'UNAVAILABLE';

export class AiError extends Error {
  constructor(
    public readonly code: AiErrorCode,
    message: string,
    public override readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'AiError';
  }
}
