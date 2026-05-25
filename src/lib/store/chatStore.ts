import { create } from 'zustand';
import { nanoid } from 'nanoid';
import type { Message, Thread, Role } from '@/lib/types';

interface State {
  threads: Record<string, Thread>;
  messagesByThread: Record<string, Message[]>;
  rootThreadId: string | null;
  activeSubThreadId: string | null;
  streamingMessageId: string | null;
}

interface Actions {
  reset: () => void;
  createThread: (input: { title: string; parentThreadId?: string | null;
    parentMessageId?: string | null; triggerWord?: string | null }) => string;
  appendMessage: (threadId: string, input: { role: Role; content: string; parentMessageId?: string | null }) => string;
  appendChunkToMessage: (threadId: string, messageId: string, chunk: string) => void;
  setStreaming: (id: string | null) => void;
  spawnSubThread: (input: { parentThreadId: string; parentMessageId: string; triggerWord: string }) => string;
  setActiveSubThread: (id: string | null) => void;
  closeSubThread: (id: string) => void;
  getThreadPath: (threadId: string) => Thread[];
  getParentContext: (threadId: string) => string;
}

export const useChatStore = create<State & Actions>((set, get) => ({
  threads: {},
  messagesByThread: {},
  rootThreadId: null,
  activeSubThreadId: null,
  streamingMessageId: null,

  reset: () => set({ threads: {}, messagesByThread: {}, rootThreadId: null, activeSubThreadId: null, streamingMessageId: null }),

  createThread: ({ title, parentThreadId = null, parentMessageId = null, triggerWord = null }) => {
    const id = nanoid();
    const thread: Thread = { id, parentThreadId, parentMessageId, triggerWord, title, createdAt: Date.now() };
    set(s => ({
      threads: { ...s.threads, [id]: thread },
      messagesByThread: { ...s.messagesByThread, [id]: [] },
      rootThreadId: s.rootThreadId ?? (parentThreadId ? s.rootThreadId : id),
    }));
    return id;
  },

  appendMessage: (threadId, { role, content, parentMessageId = null }) => {
    const id = nanoid();
    const msg: Message = { id, threadId, parentMessageId, role, content, createdAt: Date.now() };
    set(s => ({
      messagesByThread: {
        ...s.messagesByThread,
        [threadId]: [...(s.messagesByThread[threadId] ?? []), msg],
      },
    }));
    return id;
  },

  appendChunkToMessage: (threadId, messageId, chunk) => set(s => {
    const list = s.messagesByThread[threadId] ?? [];
    return {
      messagesByThread: {
        ...s.messagesByThread,
        [threadId]: list.map(m => m.id === messageId ? { ...m, content: m.content + chunk } : m),
      },
    };
  }),

  setStreaming: id => set({ streamingMessageId: id }),

  spawnSubThread: ({ parentThreadId, parentMessageId, triggerWord }) =>
    get().createThread({ title: triggerWord, parentThreadId, parentMessageId, triggerWord }),

  setActiveSubThread: id => set({ activeSubThreadId: id }),

  closeSubThread: id => set(s => {
    const { [id]: _, ...rest } = s.threads;
    const { [id]: __, ...restMsgs } = s.messagesByThread;
    return {
      threads: rest, messagesByThread: restMsgs,
      activeSubThreadId: s.activeSubThreadId === id ? null : s.activeSubThreadId,
    };
  }),

  getThreadPath: threadId => {
    const path: Thread[] = []; let cur = get().threads[threadId];
    while (cur) { path.unshift(cur); cur = cur.parentThreadId ? get().threads[cur.parentThreadId] : undefined as any; }
    return path;
  },

  getParentContext: threadId => {
    const t = get().threads[threadId];
    if (!t?.parentThreadId || !t.parentMessageId) return '';
    const msgs = get().messagesByThread[t.parentThreadId] ?? [];
    const m = msgs.find(x => x.id === t.parentMessageId);
    return m?.content ?? '';
  },
}));
