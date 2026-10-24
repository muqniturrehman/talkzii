import { answerPrompt, intentPrompt, sentimentPrompt, summarizePrompt, suggestRepliesPrompt } from './prompts';
import {
  answerSchema,
  clamp,
  intentSchema,
  replySuggestionsSchema,
  sentimentSchema,
  summarySchema,
  type Intent,
  type IntentResult,
  type SentimentResult,
} from './schemas';
import type { AiProvider, AiTasks, TaskInput } from './types';

const dedupe = (items: string[]) => [...new Set(items.map((s) => s.trim()).filter(Boolean))];

/** Inbox AI features on top of any structured-output LLM provider. */
export function createLlmTasks(provider: AiProvider): AiTasks {
  return {
    provider: provider.name,
    model: provider.model,
    async suggestReplies(input) {
      const { suggestions } = await provider.generateObject({
        ...suggestRepliesPrompt(input),
        schema: replySuggestionsSchema,
        name: 'reply_suggestions',
      });
      return dedupe(suggestions).slice(0, 3);
    },
    async summarize(input) {
      const result = await provider.generateObject({ ...summarizePrompt(input), schema: summarySchema, name: 'conversation_summary' });
      return { summary: result.summary.trim(), keyPoints: dedupe(result.keyPoints).slice(0, 8), nextSteps: dedupe(result.nextSteps).slice(0, 5) };
    },
    async sentiment(input) {
      const result = await provider.generateObject({ ...sentimentPrompt(input), schema: sentimentSchema, name: 'customer_sentiment' });
      return { ...result, score: clamp(result.score, -1, 1) };
    },
    async intent(input) {
      const result = await provider.generateObject({ ...intentPrompt(input), schema: intentSchema, name: 'customer_intent' });
      return { ...result, confidence: clamp(result.confidence, 0, 1) };
    },
    async answerQuestion(input) {
      if (input.knowledge.length === 0) return { answer: '', grounded: false };
      const result = await provider.generateObject({ ...answerPrompt(input), schema: answerSchema, name: 'grounded_answer' });
      return { answer: result.answer.trim(), grounded: result.grounded && result.answer.trim().length > 0 };
    },
  };
}

// ---------------------------------------------------------------------------
// Offline heuristics: keep the AI panel useful in demos and local development
// without API keys. English + Urdu/Roman Urdu keywords.
// ---------------------------------------------------------------------------

const NEGATIVE = /\b(bad|worst|terrible|awful|angry|late|delay(ed)?|broken|damaged|wrong|issue|problem|disappointed|refund|cancel|scam|fraud|not happy|never again|kharab|bura|ganda|bakwas|dhoka|ghatiya)\b|😡|😠|👎/i;
const POSITIVE = /\b(thanks?|thank you|great|awesome|amazing|perfect|love|excellent|good|nice|happy|shukriya|shukria|meherbani|zabardast|acha|achha|bohat acha|kamaal)\b|❤️|😍|👍|🙏/i;
const URGENT = /\b(urgent|asap|immediately|right now|today|emergency|jaldi|abhi|fori)\b|!!/i;

const INTENT_RULES: [Intent, RegExp][] = [
  ['refund', /\b(refund|return|exchange|money back|wapas|wapis|paise wapas)\b/i],
  ['complaint', /\b(complain(t)?|worst|terrible|damaged|broken|wrong item|not received|scam|fraud|kharab|ghatiya|dhoka)\b/i],
  ['order_status', /\b(order|tracking|track|deliver(y|ed)?|shipped|parcel|courier|kab tak|kab aye?ga|status)\b/i],
  ['booking', /\b(book(ing)?|appointment|reserve|reservation|slot|schedule)\b/i],
  ['pricing', /\b(price|prices|pricing|cost|rate|rates|how much|kitne ka|kitne ki|kitna|qeemat|discount|offer)\b/i],
  ['purchase', /\b(buy|purchase|order karna|lena hai|chahiye|available|in stock|cod|cash on delivery)\b/i],
  ['support', /\b(help|support|how (do|to)|not working|error|issue|problem|masla)\b/i],
  ['feedback', /\b(feedback|review|suggestion|loved|great service)\b/i],
  ['greeting', /^(hi|hello|hey|salam|salaam|assalam|aoa|asalam|good (morning|evening))\b/i],
];

const lastCustomerText = (input: TaskInput, count = 3) =>
  input.transcript
    .filter((l) => l.role === 'customer')
    .slice(-count)
    .map((l) => l.text)
    .join('\n');

function heuristicIntent(input: TaskInput): IntentResult {
  const text = lastCustomerText(input);
  for (const [intent, pattern] of INTENT_RULES) {
    if (pattern.test(text)) {
      return { intent, confidence: 0.6, summary: `Customer appears to be asking about ${intent.replace('_', ' ')}.` };
    }
  }
  return { intent: 'other', confidence: 0.3, summary: 'No clear intent detected yet.' };
}

function heuristicSentiment(input: TaskInput): SentimentResult {
  const text = lastCustomerText(input);
  const negative = NEGATIVE.test(text);
  const positive = POSITIVE.test(text);
  const urgency = URGENT.test(text) || (negative && /!/.test(text)) ? 'high' : negative ? 'medium' : 'low';
  if (negative && !positive) return { sentiment: 'negative', score: -0.6, urgency, reason: 'Recent messages contain complaint or frustration keywords.' };
  if (positive && !negative) return { sentiment: 'positive', score: 0.6, urgency, reason: 'Recent messages sound appreciative.' };
  return { sentiment: 'neutral', score: 0, urgency, reason: 'No strong emotion in recent messages.' };
}

function firstSentence(text: string): string {
  const sentence = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s/)[0] ?? '';
  return sentence.length > 240 ? `${sentence.slice(0, 237)}…` : sentence;
}

export function createHeuristicTasks(): AiTasks {
  return {
    provider: 'heuristic',
    model: 'talkzi-heuristics-v1',
    async suggestReplies(input) {
      const name = input.contactName?.split(' ')[0];
      const hi = name ? `Hi ${name}!` : 'Hi there!';
      const fact = input.knowledge[0] ? firstSentence(input.knowledge[0].content) : null;
      const byIntent: Record<Intent, string[]> = {
        greeting: [`${hi} 👋 Thanks for reaching out to ${input.businessName}. How can we help you today?`],
        pricing: [fact ? `${hi} ${fact}` : `${hi} Thanks for asking! Let me share our latest prices with you in a moment.`],
        purchase: [`${hi} Great choice! Could you confirm the item, quantity and your delivery address so we can place the order?`],
        order_status: [`${hi} Let me check the status of your order. Could you share your order number?`],
        complaint: [`${hi} I'm really sorry about this experience. Could you share your order number and a photo so we can fix it right away?`],
        refund: [`${hi} Sorry to hear that. ${fact ?? 'Please share your order number and we will guide you through the return.'}`],
        booking: [`${hi} We'd be happy to book that for you. Which date and time work best?`],
        support: [`${hi} Happy to help! Could you tell me a bit more about what's happening?`],
        feedback: [`${hi} Thank you so much for the feedback — it means a lot to the team! 🙏`],
        spam: ['Thanks for your message.'],
        other: [fact ? `${hi} ${fact}` : `${hi} Thanks for your message! Let me check and get back to you shortly.`],
      };
      const { intent } = heuristicIntent(input);
      return dedupe([
        ...byIntent[intent],
        `${hi} Thanks for your patience — I'm looking into this now and will update you shortly.`,
        'Is there anything else I can help you with?',
      ]).slice(0, 3);
    },
    async summarize(input) {
      const customer = input.transcript.filter((l) => l.role === 'customer');
      const { intent } = heuristicIntent(input);
      const who = input.contactName ?? 'The customer';
      return {
        summary: `${who} sent ${customer.length} message${customer.length === 1 ? '' : 's'} in this conversation; the main topic looks like ${intent.replace('_', ' ')}.`,
        keyPoints: customer.slice(-3).map((l) => (l.text.length > 160 ? `${l.text.slice(0, 157)}…` : l.text)),
        nextSteps: [input.transcript.at(-1)?.role === 'customer' ? 'Reply to the latest customer message.' : 'Wait for the customer to respond.'],
      };
    },
    async sentiment(input) {
      return heuristicSentiment(input);
    },
    async intent(input) {
      return heuristicIntent(input);
    },
    async answerQuestion(input) {
      const best = input.knowledge[0];
      return best ? { answer: firstSentence(best.content), grounded: true } : { answer: '', grounded: false };
    },
  };
}
