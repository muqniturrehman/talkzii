import 'server-only';
import { resolveAiSettings, type AiSettings } from '@talkzi/shared';
import { ApiError } from '@/lib/api/errors';
import type { TypedSupabaseClient } from '@/lib/supabase/types';
import { searchKnowledge } from './knowledge';
import { TRANSCRIPT_LIMIT } from './prompts';
import type { TaskInput, TranscriptLine } from './types';

const fallbackText: Record<string, string> = {
  image: '[photo]',
  video: '[video]',
  audio: '[voice message]',
  document: '[document]',
  sticker: '[sticker]',
  location: '[location]',
  contacts: '[contact card]',
};

/** Loads the transcript, contact and workspace AI settings for one conversation (service role, workspace-scoped). */
export async function loadTaskInput(
  admin: TypedSupabaseClient,
  workspace: { id: string; name: string },
  conversationId: string,
  options: { withKnowledge: boolean },
): Promise<{ input: TaskInput; settings: AiSettings }> {
  const [{ data: conversation }, { data: ws }, { data: messages }] = await Promise.all([
    admin
      .from('conversations')
      .select('id, contact:contacts!inner(name, profile_name)')
      .eq('id', conversationId)
      .eq('workspace_id', workspace.id)
      .maybeSingle(),
    admin.from('workspaces').select('name, settings').eq('id', workspace.id).maybeSingle(),
    admin
      .from('messages')
      .select('direction, sender_type, type, body, created_at')
      .eq('workspace_id', workspace.id)
      .eq('conversation_id', conversationId)
      .neq('type', 'reaction')
      .order('created_at', { ascending: false })
      .limit(TRANSCRIPT_LIMIT),
  ]);
  if (!conversation) throw ApiError.notFound('Conversation not found.');

  const transcript: TranscriptLine[] = (messages ?? [])
    .reverse()
    .map((m) => ({
      role: m.direction === 'inbound' ? ('customer' as const) : m.sender_type === 'bot' ? ('bot' as const) : ('agent' as const),
      text: (m.body ?? fallbackText[m.type] ?? `[${m.type}]`).slice(0, 2_000),
      at: m.created_at,
    }));

  const settings = resolveAiSettings(ws?.settings);
  const query = transcript
    .filter((l) => l.role === 'customer')
    .slice(-2)
    .map((l) => l.text)
    .join('\n');
  const knowledge = options.withKnowledge && query ? await searchKnowledge(admin, workspace.id, query) : [];

  return {
    input: {
      businessName: ws?.name ?? workspace.name,
      contactName: conversation.contact.name ?? conversation.contact.profile_name ?? null,
      tone: settings.tone,
      transcript,
      knowledge,
    },
    settings,
  };
}
