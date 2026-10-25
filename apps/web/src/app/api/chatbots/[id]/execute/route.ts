import { executeChatbotSchema, flowGraphSchema, planHasFeature, resolveAiSettings } from '@talkzi/shared';
import { buildTemplateSendComponents, renderTemplatePreview, summarizeTemplate } from '@talkzi/whatsapp/templates';
import { ApiError } from '@/lib/api/errors';
import { createHandler, requireUuid } from '@/lib/api/handler';
import { getAiTasks } from '@/lib/ai';
import { assertAiCredits, recordAiCredit } from '@/lib/ai/credits';
import { searchKnowledge } from '@/lib/ai/knowledge';
import { runFlow } from '@/lib/chatbots/engine';
import { simulatorActions } from '@/lib/chatbots/runtime';
import { RATE_LIMITS } from '@/lib/rate-limit';

/**
 * Builder test panel: runs one turn of the flow against a simulated customer
 * and returns what the bot would send, without touching WhatsApp.
 */
export const POST = createHandler(
  { role: 'agent', body: executeChatbotSchema, rateLimit: { ...RATE_LIMITS.ai, prefix: 'chatbot:execute', limit: 60 } },
  async ({ supabase, admin, params, body, workspace, user }) => {
    const id = requireUuid(params.id, 'Chatbot');
    const { data: flow } = await supabase.from('chatbot_flows').select('id, graph').eq('id', id).maybeSingle();
    if (!flow) throw ApiError.notFound('Chatbot not found.');
    const stored = flowGraphSchema.safeParse(flow.graph);
    const graph = body.graph ?? (stored.success ? stored.data : null);
    if (!graph) throw ApiError.badRequest('This flow has an invalid graph.');

    const actions = simulatorActions();
    actions.aiReply = async (question) => {
      if (!planHasFeature(workspace.plan, 'ai_inbox')) return null;
      const db = admin();
      const { data: ws } = await db.from('workspaces').select('settings').eq('id', workspace.id).maybeSingle();
      const knowledge = await searchKnowledge(db, workspace.id, question);
      if (!knowledge.length) return null;
      const tasks = getAiTasks();
      if (tasks.provider !== 'heuristic') await assertAiCredits(db, workspace);
      const result = await tasks.answerQuestion({
        businessName: workspace.name,
        contactName: 'Test customer',
        tone: resolveAiSettings(ws?.settings).tone,
        transcript: [{ role: 'customer', text: question, at: new Date().toISOString() }],
        knowledge,
      });
      if (tasks.provider !== 'heuristic') await recordAiCredit(db, workspace.id);
      return result.grounded ? result.answer : null;
    };

    // Show the rendered template (and catch missing variables) instead of the raw id.
    actions.sendTemplate = async (templateId, variables) => {
      const { data: template } = await supabase.from('message_templates').select('name, status, components').eq('id', templateId).maybeSingle();
      if (!template) throw ApiError.badRequest('The template in this flow no longer exists.');
      const summary = summarizeTemplate(template.components);
      buildTemplateSendComponents(summary, { body: variables });
      actions.messages.push({ kind: 'template', name: `${template.name}${template.status === 'APPROVED' ? '' : ` (${template.status.toLowerCase()})`}`, text: renderTemplatePreview(summary, { body: variables }) });
    };

    const contact = { name: 'Test Customer', profile_name: null, wa_id: '923001234567', custom_fields: { city: 'Lahore' } };
    const state = await runFlow(graph, body.state, { text: body.text, replyId: body.buttonId ?? null }, contact, actions);
    return { messages: actions.messages, state, testedBy: user.id };
  },
);
