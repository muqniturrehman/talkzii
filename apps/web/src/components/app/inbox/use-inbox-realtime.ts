'use client';

import * as React from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import type { ConversationListItem, MessageItem, NoteItem } from '@/lib/inbox/types';
import { inboxKeys, patchConversation, upsertMessage } from './use-inbox';

export interface PresenceMeta {
  userId: string;
  name: string;
  avatarUrl: string | null;
  conversationId: string | null;
  typing: boolean;
}

interface BroadcastPayload<T> {
  table: string;
  op: 'insert' | 'update' | 'delete';
  record: T;
}

/**
 * Subscribes to the private `workspace:<id>` channel: database broadcasts
 * (messages, conversations, notes) patch the query cache, and presence powers
 * the "also viewing / typing" collision banner.
 */
export function useInboxRealtime({
  workspaceId,
  me,
  conversationId,
  typing,
}: {
  workspaceId: string;
  me: { id: string; name: string; avatarUrl: string | null };
  conversationId: string | null;
  typing: boolean;
}) {
  const qc = useQueryClient();
  const channelRef = React.useRef<RealtimeChannel | null>(null);
  const [presence, setPresence] = React.useState<PresenceMeta[]>([]);
  const [connected, setConnected] = React.useState(false);
  const meta = React.useRef<PresenceMeta>({ userId: me.id, name: me.name, avatarUrl: me.avatarUrl, conversationId, typing });
  React.useEffect(() => {
    meta.current = { userId: me.id, name: me.name, avatarUrl: me.avatarUrl, conversationId, typing };
  });

  React.useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let cancelled = false;
    let listTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshLists = () => {
      clearTimeout(listTimer);
      listTimer = setTimeout(() => {
        void qc.invalidateQueries({ queryKey: inboxKeys.lists() });
        void qc.invalidateQueries({ queryKey: inboxKeys.counts() });
      }, 400);
    };

    const onMessage = ({ payload }: { payload: BroadcastPayload<MessageItem> }) => {
      upsertMessage(qc, payload.record);
      refreshLists();
    };
    const onConversation = ({ payload }: { payload: BroadcastPayload<ConversationListItem> }) => {
      patchConversation(qc, payload.record.id, payload.record);
      refreshLists();
    };
    const onNote = ({ payload }: { payload: BroadcastPayload<NoteItem> }) => {
      if (payload.record.conversation_id) void qc.invalidateQueries({ queryKey: inboxKeys.notes(payload.record.conversation_id) });
    };

    let channel: RealtimeChannel | null = null;
    void (async () => {
      // Private channels authorise with the user's JWT.
      await supabase.realtime.setAuth();
      if (cancelled) return;
      channel = supabase.channel(`workspace:${workspaceId}`, { config: { private: true, presence: { key: me.id } } });
      channel
        .on('broadcast', { event: 'messages.insert' }, onMessage)
        .on('broadcast', { event: 'messages.update' }, onMessage)
        .on('broadcast', { event: 'conversations.insert' }, onConversation)
        .on('broadcast', { event: 'conversations.update' }, onConversation)
        .on('broadcast', { event: 'internal_notes.insert' }, onNote)
        .on('broadcast', { event: 'internal_notes.update' }, onNote)
        .on('broadcast', { event: 'internal_notes.delete' }, onNote)
        .on('presence', { event: 'sync' }, () => {
          const state = channel?.presenceState<PresenceMeta>() ?? {};
          setPresence(Object.values(state).flatMap((entries) => entries.slice(-1)));
        })
        .subscribe((status) => {
          setConnected(status === 'SUBSCRIBED');
          if (status === 'SUBSCRIBED') void channel?.track(meta.current);
        });
      channelRef.current = channel;
    })();

    return () => {
      cancelled = true;
      clearTimeout(listTimer);
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [qc, workspaceId, me.id]);

  // Re-announce what I'm looking at whenever it changes.
  React.useEffect(() => {
    const channel = channelRef.current;
    if (!channel || !connected) return;
    const timer = setTimeout(() => void channel.track(meta.current), typing ? 0 : 150);
    return () => clearTimeout(timer);
  }, [conversationId, typing, connected]);

  const viewers = React.useMemo(
    () => presence.filter((p) => p.userId !== me.id && conversationId && p.conversationId === conversationId),
    [presence, me.id, conversationId],
  );

  return { viewers, connected };
}
