import 'server-only';
import type { TypedSupabaseClient } from '@/lib/supabase/types';

const PAGE = 1000;

interface LooseQuery extends PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> {
  select(columns: string): LooseQuery;
  eq(column: string, value: string): LooseQuery;
  in(column: string, values: string[]): LooseQuery;
  order(column: string): LooseQuery;
  range(from: number, to: number): LooseQuery;
}

/** Workspace tables in the export. Secrets (tokens, hashes, signing keys) are never selected. */
const SECTIONS: { key: string; table: string; columns: string; order: string }[] = [
  { key: 'members', table: 'workspace_members', columns: 'role, created_at, profile:profiles!workspace_members_user_id_fkey(full_name, email)', order: 'created_at' },
  { key: 'whatsapp_accounts', table: 'waba_accounts', columns: 'id, waba_id, business_id, name, status, created_at', order: 'created_at' },
  { key: 'phone_numbers', table: 'phone_numbers', columns: 'id, phone_number_id, display_phone_number, verified_name, quality_rating, messaging_limit_tier, status, created_at', order: 'created_at' },
  { key: 'contacts', table: 'contacts', columns: '*', order: 'id' },
  { key: 'labels', table: 'labels', columns: '*', order: 'id' },
  { key: 'contact_labels', table: 'contact_labels', columns: '*', order: 'contact_id' },
  { key: 'conversations', table: 'conversations', columns: '*', order: 'id' },
  { key: 'messages', table: 'messages', columns: '*', order: 'id' },
  { key: 'internal_notes', table: 'internal_notes', columns: '*', order: 'id' },
  { key: 'canned_replies', table: 'canned_replies', columns: '*', order: 'id' },
  { key: 'message_templates', table: 'message_templates', columns: '*', order: 'id' },
  { key: 'broadcasts', table: 'broadcasts', columns: '*', order: 'id' },
  { key: 'chatbot_flows', table: 'chatbot_flows', columns: '*', order: 'id' },
  { key: 'webhooks', table: 'webhooks', columns: 'id, url, description, events, active, created_at', order: 'id' },
  { key: 'integrations', table: 'integrations', columns: 'id, provider, name, status, config, created_at', order: 'id' },
  { key: 'api_keys', table: 'api_keys', columns: 'id, name, prefix, scopes, expires_at, revoked_at, created_at', order: 'id' },
  { key: 'audit_log', table: 'audit_log', columns: 'id, actor_type, action, target_type, target_id, metadata, created_at', order: 'id' },
];

function streamOf(chunks: AsyncGenerator<string>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await chunks.next();
        if (done) controller.close();
        else controller.enqueue(encoder.encode(value));
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel() {
      await chunks.return(undefined);
    },
  });
}

async function* rows(db: { from(table: string): LooseQuery }, table: string, columns: string, order: string, workspaceId: string) {
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(table).select(columns).eq('workspace_id', workspaceId).order(order).range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    yield* data ?? [];
    if (!data || data.length < PAGE) return;
  }
}

/** Streams the whole workspace as one JSON document, page by page (constant memory). */
export function workspaceExportStream(admin: TypedSupabaseClient, workspace: Record<string, unknown> & { id: string }): ReadableStream<Uint8Array> {
  const db = admin as unknown as { from(table: string): LooseQuery };
  async function* document() {
    yield `{"format":"talkzi-export/v1","exported_at":${JSON.stringify(new Date().toISOString())},"workspace":${JSON.stringify(workspace)}`;
    for (const section of SECTIONS) {
      yield `,${JSON.stringify(section.key)}:[`;
      let first = true;
      for await (const row of rows(db, section.table, section.columns, section.order, workspace.id)) {
        yield `${first ? '' : ','}${JSON.stringify(row)}`;
        first = false;
      }
      yield ']';
    }
    yield '}';
  }
  return streamOf(document());
}

/** Everything held about one end customer (data subject access request). */
export async function contactExport(admin: TypedSupabaseClient, workspaceId: string, contactId: string) {
  const { data: contact } = await admin.from('contacts').select('*').eq('workspace_id', workspaceId).eq('id', contactId).maybeSingle();
  if (!contact) return null;
  const [labels, conversations, messages, notes] = await Promise.all([
    admin.from('contact_labels').select('label:labels(name)').eq('contact_id', contactId),
    admin.from('conversations').select('id, status, created_at, last_message_at, category').eq('contact_id', contactId),
    admin.from('messages').select('id, conversation_id, direction, type, status, sender_type, body, content, media, created_at').eq('contact_id', contactId).order('created_at'),
    admin.from('internal_notes').select('id, conversation_id, body, created_at').eq('contact_id', contactId).order('created_at'),
  ]);
  return {
    format: 'talkzi-contact-export/v1',
    exported_at: new Date().toISOString(),
    contact,
    labels: (labels.data ?? []).flatMap((l) => (l.label ? [l.label.name] : [])),
    conversations: conversations.data ?? [],
    messages: messages.data ?? [],
    notes: notes.data ?? [],
  };
}
