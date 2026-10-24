import 'server-only';
import { env } from '@/lib/env';
import { createHashEmbedder, type Embedder } from './embeddings';
import { createAnthropicProvider } from './providers/anthropic';
import { createOpenAiEmbedder, createOpenAiProvider } from './providers/openai';
import { createHeuristicTasks, createLlmTasks } from './tasks';
import type { AiTasks } from './types';

/**
 * AI_PROVIDER picks the preferred LLM (openai by default, or anthropic); the
 * other one is used when only its key is set, and offline heuristics when
 * neither is configured.
 */
export function getAiTasks(): AiTasks {
  const e = env();
  const order = e.AI_PROVIDER?.toLowerCase() === 'anthropic' ? (['anthropic', 'openai'] as const) : (['openai', 'anthropic'] as const);
  for (const name of order) {
    if (name === 'openai' && e.OPENAI_API_KEY) {
      return createLlmTasks(createOpenAiProvider({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_MODEL }));
    }
    if (name === 'anthropic' && e.ANTHROPIC_API_KEY) {
      return createLlmTasks(createAnthropicProvider({ apiKey: e.ANTHROPIC_API_KEY, model: e.ANTHROPIC_MODEL }));
    }
  }
  return createHeuristicTasks();
}

/** OpenAI embeddings when configured (Anthropic has no embeddings API), else the offline hash embedder. */
export function getEmbedder(): Embedder {
  const e = env();
  return e.OPENAI_API_KEY ? createOpenAiEmbedder({ apiKey: e.OPENAI_API_KEY, model: e.OPENAI_EMBEDDING_MODEL }) : createHashEmbedder();
}

export * from './types';
export * from './schemas';
