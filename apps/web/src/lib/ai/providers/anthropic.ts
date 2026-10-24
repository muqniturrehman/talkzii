import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { AiError, type AiProvider } from '../types';

export const ANTHROPIC_DEFAULT_MODEL = 'claude-opus-5-5';

/** `output_config.effort` isn't accepted by the older 4.5-generation Sonnet/Haiku models. */
const supportsEffort = (model: string) => !/claude-(sonnet|haiku)-4-5|claude-3/.test(model);

export function mapAnthropicError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof z.ZodError) return new AiError('BAD_OUTPUT', 'The AI returned an unexpected answer. Try again.', error);
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new AiError('AUTH', 'The Anthropic API key is invalid or lacks access to this model.', error);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiError('RATE_LIMITED', 'The AI provider is rate limiting requests. Try again in a minute.', error);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError('UNAVAILABLE', 'The AI provider rejected the request. Check ANTHROPIC_MODEL.', error);
  }
  // APIConnectionError extends APIError in the TypeScript SDK, so check it first.
  if (error instanceof Anthropic.APIConnectionError) return new AiError('UNAVAILABLE', 'Could not reach Anthropic.', error);
  if (error instanceof Anthropic.APIError) return new AiError('UNAVAILABLE', `Anthropic error (${error.status ?? 'unknown'}).`, error);
  return new AiError('UNAVAILABLE', 'The AI request failed.', error);
}

/**
 * Claude via the Messages API with structured outputs. Policy declines are
 * retried server-side on Anthropic's recommended fallback model
 * (`fallbacks: "default"`); a final refusal surfaces as REFUSED.
 */
export function createAnthropicProvider(options: { apiKey: string; model?: string }): AiProvider {
  const client = new Anthropic({ apiKey: options.apiKey, timeout: 25_000, maxRetries: 1 });
  const model = options.model || ANTHROPIC_DEFAULT_MODEL;

  return {
    name: 'anthropic',
    model,
    async generateObject(request) {
      try {
        const response = await client.beta.messages.parse({
          model,
          max_tokens: request.maxTokens ?? 16_000,
          system: request.system,
          messages: [{ role: 'user', content: request.prompt }],
          output_config: {
            ...(supportsEffort(model) ? { effort: 'low' as const } : {}),
            format: betaZodOutputFormat(request.schema),
          },
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        });
        if (response.stop_reason === 'refusal') {
          throw new AiError('REFUSED', 'The AI declined to answer this conversation.');
        }
        if (response.stop_reason === 'max_tokens') {
          throw new AiError('BAD_OUTPUT', 'The AI answer was cut off. Try again.');
        }
        return request.schema.parse(response.parsed_output);
      } catch (error) {
        throw mapAnthropicError(error);
      }
    },
  };
}
