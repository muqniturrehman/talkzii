import 'server-only';
import { aiConversationSchema, planHasFeature } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { loadTaskInput } from './context';
import { assertAiCredits, recordAiCredit } from './credits';
import { getAiTasks } from './index';
import { AiError, type AiTasks } from './types';

type TaskName = 'suggestReplies' | 'summarize' | 'sentiment' | 'intent';

export function toApiError(error: AiError): ApiError {
  switch (error.code) {
    case 'RATE_LIMITED':
      return ApiError.rateLimited(30);
    case 'AUTH':
      return new ApiError(503, 'AI_ERROR', 'The AI provider is not configured correctly. Check the API key in your environment.');
    case 'REFUSED':
      return new ApiError(422, 'AI_ERROR', error.message);
    default:
      return new ApiError(502, 'AI_ERROR', error.message);
  }
}

/**
 * POST { conversationId } → { result, provider, model, knowledge }.
 * Pipeline: agent role → AI enabled for the workspace → credits (paid
 * providers only) → task → record credit.
 */
export function aiConversationRoute<T extends TaskName>(task: T, options: { knowledge?: boolean } = {}) {
  return createHandler(
    { role: 'agent', body: aiConversationSchema, rateLimit: RATE_LIMITS.ai },
    async ({ body, workspace, admin, log }) => {
      const db = admin();
      const withKnowledge = Boolean(options.knowledge) && planHasFeature(workspace.plan, 'ai_inbox');
      const { input, settings } = await loadTaskInput(db, workspace, body.conversationId, { withKnowledge });
      if (!settings.enabled) throw ApiError.forbidden('AI features are turned off for this workspace (Settings → AI).');
      if (input.transcript.length === 0) throw ApiError.badRequest('This conversation has no messages yet.');

      const tasks = getAiTasks();
      const metered = tasks.provider !== 'heuristic';
      if (metered) await assertAiCredits(db, workspace);

      try {
        const result = (await tasks[task](input)) as Awaited<ReturnType<AiTasks[T]>>;
        if (metered) await recordAiCredit(db, workspace.id);
        return {
          result,
          provider: tasks.provider,
          model: tasks.model,
          knowledge: input.knowledge.map((k) => ({ title: k.title, similarity: Number(k.similarity.toFixed(3)) })),
        };
      } catch (error) {
        if (error instanceof AiError) {
          log.warn({ err: error.cause ?? error, code: error.code, task }, 'AI task failed');
          throw toApiError(error);
        }
        throw error;
      }
    },
  );
}
