import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Message } from '@/lib/types';

interface State {
  /** All messages keyed by id, grouped per topic for fast lookup. */
  byTopic: Record<string, Record<string, Message>>;
  streamingMessageId: string | null;
}

interface Actions {
  hydrateTopic: (topicId: string, messages: Message[]) => void;
  upsert: (m: Message) => void;
  appendChunk: (topicId: string, messageId: string, chunk: string) => void;
  setContent: (topicId: string, messageId: string, content: string) => void;
  remove: (topicId: string, messageId: string) => void;
  setStreaming: (id: string | null) => void;
}

export const useMessageStore = create<State & Actions>()(
  persist(
    (set) => ({
      byTopic: {},
      streamingMessageId: null,
      hydrateTopic: (topicId, messages) =>
        set((s) => ({
          byTopic: {
            ...s.byTopic,
            [topicId]: Object.fromEntries(messages.map((m) => [m.id, m])),
          },
        })),
      upsert: (m) =>
        set((s) => ({
          byTopic: {
            ...s.byTopic,
            [m.topicId]: { ...(s.byTopic[m.topicId] ?? {}), [m.id]: m },
          },
        })),
      appendChunk: (topicId, messageId, chunk) =>
        set((s) => {
          const t = s.byTopic[topicId];
          if (!t || !t[messageId]) return s;
          const cur = t[messageId];
          return {
            byTopic: {
              ...s.byTopic,
              [topicId]: { ...t, [messageId]: { ...cur, content: cur.content + chunk } },
            },
          };
        }),
      setContent: (topicId, messageId, content) =>
        set((s) => {
          const t = s.byTopic[topicId];
          if (!t || !t[messageId]) return s;
          return {
            byTopic: {
              ...s.byTopic,
              [topicId]: { ...t, [messageId]: { ...t[messageId], content } },
            },
          };
        }),
      remove: (topicId, messageId) =>
        set((s) => {
          const t = s.byTopic[topicId];
          if (!t) return s;
          const { [messageId]: _drop, ...rest } = t;
          void _drop;
          return { byTopic: { ...s.byTopic, [topicId]: rest } };
        }),
      setStreaming: (id) => set({ streamingMessageId: id }),
    }),
    { name: 'feynman.messages' },
  ),
);

export function selectMessagesOfBranch(
  byTopic: Record<string, Record<string, Message>>,
  topicId: string,
  branchId: string,
): Message[] {
  const m = byTopic[topicId];
  if (!m) return [];
  const out: Message[] = [];
  for (const id in m) if (m[id].branchId === branchId) out.push(m[id]);
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}

export function selectBranchesUnder(
  byTopic: Record<string, Record<string, Message>>,
  topicId: string,
  parentMessageId: string,
): Message[] {
  // Returns the FIRST message of each branch that hangs off this message.
  const m = byTopic[topicId];
  if (!m) return [];
  const out: Message[] = [];
  for (const id in m) {
    const msg = m[id];
    if (msg.branchFrom && msg.branchFrom.parentMessageId === parentMessageId) out.push(msg);
  }
  out.sort((a, b) => a.createdAt - b.createdAt);
  return out;
}
