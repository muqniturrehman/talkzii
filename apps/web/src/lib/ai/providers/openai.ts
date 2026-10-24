import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { AiError, type AiProvider } from '../types';

export const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';
export const OPENAI_DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

/** Reasoning models take a `reasoning` block; older chat models reject it. */
const isReasoningModel = (model: string) => /^(gpt-5|o\d)/.test(model);

export function mapOpenAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof z.ZodError) return new AiError('BAD_OUTPUT', 'The AI returned an unexpected answer. Try again.', error);
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) {
    return new AiError('AUTH', 'The OpenAI API key is invalid or lacks access to this model.', error);
  }
  if (error instanceof OpenAI.RateLimitError) {
    return new AiError('RATE_LIMITED', 'The AI provider is rate limiting requests. Try again in a minute.', error);
  }
  if (error instanceof OpenAI.APIConnectionError) return new AiError('UNAVAILABLE', 'Could not reach OpenAI.', error);
  if (error instanceof OpenAI.APIError) return new AiError('UNAVAILABLE', `OpenAI error (${error.status ?? 'unknown'}).`, error);
  return new AiError('UNAVAILABLE', 'The AI request failed.', error);
}

/** OpenAI Responses API with strict JSON-schema outputs. */
export function createOpenAiProvider(options: { apiKey: string; model?: string }): AiProvider {
  const client = new OpenAI({ apiKey: options.apiKey, timeout: 25_000, maxRetries: 1 });
  const model = options.model || OPENAI_DEFAULT_MODEL;

  return {
    name: 'openai',
    model,
    async generateObject(request) {
      try {
        const response = await client.responses.parse({
          model,
          instructions: request.system,
          input: request.prompt,
          max_output_tokens: request.maxTokens ?? 4_000,
          ...(isReasoningModel(model) ? { reasoning: { effort: 'low' as const } } : {}),
          text: { format: zodTextFormat(request.schema, request.name) },
        });
        if (response.output_parsed == null) {
          throw new AiError('BAD_OUTPUT', 'The AI did not return an answer. Try again.');
        }
        return request.schema.parse(response.output_parsed);
      } catch (error) {
        throw mapOpenAiError(error);
      }
    },
  };
}

export function createOpenAiEmbedder(options: { apiKey: string; model?: string }) {
  const client = new OpenAI({ apiKey: options.apiKey, timeout: 30_000, maxRetries: 2 });
  const model = options.model || OPENAI_DEFAULT_EMBEDDING_MODEL;
  return {
    model,
    minSimilarity: 0.25,
    async embed(texts: string[]): Promise<number[][]> {
      if (texts.length === 0) return [];
      try {
        const out: number[][] = [];
        // The embeddings endpoint accepts up to 2048 inputs per request.
        for (let i = 0; i < texts.length; i += 256) {
          const res = await client.embeddings.create({ model, input: texts.slice(i, i + 256), dimensions: 1536 });
          out.push(...res.data.sort((a, b) => a.index - b.index).map((d) => d.embedding));
        }
        return out;
      } catch (error) {
        throw mapOpenAiError(error);
      }
    },
  };
}
