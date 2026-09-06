import { create } from 'zustand';
import type { Message } from '@/lib/types';

interface State {
  /** All messages keyed by id, grouped per topic for fast lookup. */
  byTopic: Record<string, Record<string, Message>>;
  /**
   * Topics whose messages have been fetched at least once. Lets the UI tell
   * "not loaded yet" apart from "loaded and genuinely empty", so a refresh
   * shows a skeleton instead of a misleading empty state.
   */
  hydratedTopics: Record<string, boolean>;
  streamingMessageId: string | null;
}

interface Actions {
  hydrateTopic: (topicId: string, messages: Message[]) => void;
  upsert: (m: Message) => void;
  appendChunk: (topicId: string, messageId: string, chunk: string) => void;
  /** Commit any coalesced stream chunks immediately. */
  flushChunks: () => void;
  setContent: (topicId: string, messageId: string, content: string) => void;
  remove: (topicId: string, messageId: string) => void;
  setStreaming: (id: string | null) => void;
}

/**
 * Deliberately NOT persisted. SQLite is the source of truth and
 * `loadTopicMessages` re-hydrates on every topic switch, so a localStorage
 * copy of every message in every topic only bought us quota pressure (the
 * 5MB cap fails silently) and a second, staler source of truth. It also used
 * to persist `streamingMessageId`, which left the composer permanently
 * disabled if you refreshed mid-stream — the id came back on rehydration and
 * nothing ever cleared it.
 */
export const useMessageStore = create<State & Actions>()((set) => ({
  byTopic: {},
  hydratedTopics: {},
  streamingMessageId: null,
  hydrateTopic: (topicId, messages) => {
    // Drop buffered chunks for this topic; they belong to the old snapshot.
    pending.delete(topicId);
    set((s) => ({
      byTopic: {
        ...s.byTopic,
        [topicId]: Object.fromEntries(messages.map((m) => [m.id, m])),
      },
      hydratedTopics: { ...s.hydratedTopics, [topicId]: true },
    }));
  },
  upsert: (m) =>
    set((s) => ({
      byTopic: {
        ...s.byTopic,
        [m.topicId]: { ...(s.byTopic[m.topicId] ?? {}), [m.id]: m },
      },
    })),
  appendChunk: (topicId, messageId, chunk) => {
    if (!chunk) return;
    let perMsg = pending.get(topicId);
    if (!perMsg) {
      perMsg = new Map();
      pending.set(topicId, perMsg);
    }
    perMsg.set(messageId, (perMsg.get(messageId) ?? '') + chunk);
    scheduleFlush();
  },
  flushChunks: () => flushPending(),
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
      pending.get(topicId)?.delete(messageId);
      const t = s.byTopic[topicId];
      if (!t) return s;
      const { [messageId]: _drop, ...rest } = t;
      void _drop;
      return { byTopic: { ...s.byTopic, [topicId]: rest } };
    }),
  setStreaming: (id) => {
    // Flush first so the last tokens are committed before anything reads the
    // final content (the send action persists it right after).
    flushPending();
    set({ streamingMessageId: id });
  },
}));

/**
 * Coalescing buffer for stream deltas: topicId -> messageId -> pending text.
 *
 * A reply arrives as hundreds of small deltas. Committing each one meant a
 * store update — and a re-render of the conversation — per token, which is
 * what made long answers stutter. Deltas are now accumulated and applied once
 * per animation frame, so render cost is bounded by frame rate, not token rate.
 */
const pending = new Map<string, Map<string, string>>();
let flushHandle: ReturnType<typeof setTimeout> | number | null = null;

function scheduleFlush(): void {
  if (flushHandle !== null) return;
  if (typeof requestAnimationFrame === 'function') {
    flushHandle = requestAnimationFrame(() => {
      flushHandle = null;
      flushPending();
    });
  } else {
    // No rAF in tests / SSR — a short timer keeps the same batching semantics.
    flushHandle = setTimeout(() => {
      flushHandle = null;
      flushPending();
    }, 16);
  }
}

function flushPending(): void {
  if (pending.size === 0) return;
  const batch = new Map(pending);
  pending.clear();
  useMessageStore.setState((s) => {
    const byTopic: Record<string, Record<string, Message>> = { ...s.byTopic };
    let changed = false;
    for (const [topicId, perMsg] of batch) {
      const topic = byTopic[topicId];
      if (!topic) continue;
      const nextTopic: Record<string, Message> = { ...topic };
      let topicChanged = false;
      for (const [messageId, text] of perMsg) {
        const cur: Message | undefined = nextTopic[messageId];
        if (!cur) continue;
        nextTopic[messageId] = { ...cur, content: cur.content + text };
        topicChanged = true;
      }
      if (topicChanged) {
        byTopic[topicId] = nextTopic;
        changed = true;
      }
    }
    return changed ? { byTopic } : s;
  });
}

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
