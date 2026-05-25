import { nanoid } from 'nanoid';
import { useTopicStore } from './topicStore';
import { useMessageStore, selectMessagesOfBranch } from './messageStore';
import { useUiStore } from './uiStore';
import { fetchStream } from '@/lib/utils/fetchStream';
import type { Message, Topic, BranchInfo } from '@/lib/types';

/** Fetch all topics, then load messages of the active one. */
export async function loadAllTopics(): Promise<Topic[]> {
  const res = await fetch('/api/topics');
  const topics = (await res.json()) as Topic[];
  useTopicStore.getState().hydrate(topics);
  return topics;
}

export async function loadTopicMessages(topicId: string): Promise<Message[]> {
  const res = await fetch(`/api/topics/${topicId}`);
  if (!res.ok) return [];
  const data = (await res.json()) as { topic: Topic; messages: Message[] };
  useMessageStore.getState().hydrateTopic(topicId, data.messages);
  useTopicStore.getState().upsert(data.topic);
  return data.messages;
}

export async function createTopic(title: string): Promise<Topic> {
  const res = await fetch('/api/topics', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  });
  const t = (await res.json()) as Topic;
  useTopicStore.getState().upsert(t);
  useMessageStore.getState().hydrateTopic(t.id, []);
  return t;
}

export async function deleteTopic(topicId: string) {
  await fetch(`/api/topics/${topicId}`, { method: 'DELETE' });
  useTopicStore.getState().remove(topicId);
  const ui = useUiStore.getState();
  if (ui.activeTopicId === topicId) ui.setActiveTopic(null);
}

async function persistMessage(m: Message, setAsRoot = false) {
  await fetch('/api/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...m, setAsRoot }),
  });
}

async function persistMessageContent(id: string, content: string) {
  await fetch(`/api/messages/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

function lastMessageOfBranch(topicId: string, branchId: string): Message | null {
  const msgs = selectMessagesOfBranch(useMessageStore.getState().byTopic, topicId, branchId);
  return msgs.length ? msgs[msgs.length - 1] : null;
}

/** Build full history (system already added server-side) for streaming a branch reply. */
function buildHistoryForBranch(topicId: string, branchId: string): {
  history: { role: 'user' | 'assistant'; content: string }[];
  parentContext: string;
  selectedText: string | null;
} {
  const byTopic = useMessageStore.getState().byTopic[topicId] ?? {};
  const branchMsgs = selectMessagesOfBranch({ [topicId]: byTopic }, topicId, branchId);

  if (branchId === 'main') {
    return {
      history: branchMsgs
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      parentContext: '',
      selectedText: null,
    };
  }

  const firstBranchMsg = branchMsgs[0];
  const branchFrom = firstBranchMsg?.branchFrom;
  if (!branchFrom) {
    return {
      history: branchMsgs
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
      parentContext: '',
      selectedText: null,
    };
  }
  const parentMsg = byTopic[branchFrom.parentMessageId];
  const parentContext = parentMsg?.content ?? '';

  return {
    history: branchMsgs
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content })),
    parentContext,
    selectedText: branchFrom.selectedText,
  };
}

interface SendOpts {
  topicId: string;
  branchId: string;
  text: string;
  /** Provided only when this user message also creates a new branch. */
  newBranch?: { parentMessageId: string; selectedText: string };
}

/**
 * Append a user message and stream an assistant reply on `branchId`.
 * If `newBranch` is set, the user message + reply will live in a NEW branch
 * whose branchId equals the user message's own id.
 */
export async function sendMessage(opts: SendOpts): Promise<{ branchId: string; assistantId: string }> {
  const { topicId, text } = opts;
  const ms = useMessageStore.getState();

  // Compute the actual branchId
  let branchId = opts.branchId;
  const userId = nanoid();
  if (opts.newBranch) {
    branchId = userId; // new branch keyed by its first message
  }

  // Find last message in this (possibly new) branch
  const prev = opts.newBranch
    ? null
    : lastMessageOfBranch(topicId, branchId);

  const branchFrom: BranchInfo | null = opts.newBranch
    ? {
        parentMessageId: opts.newBranch.parentMessageId,
        selectedText: opts.newBranch.selectedText,
      }
    : null;

  const userMsg: Message = {
    id: userId,
    topicId,
    branchId,
    parentMessageId: prev?.id ?? null,
    role: 'user',
    content: text,
    branchFrom,
    createdAt: Date.now(),
  };
  ms.upsert(userMsg);

  // Decide if this is the very first message of the topic
  const topic = useTopicStore.getState().topics[topicId];
  const setAsRoot = !topic?.rootMessageId && branchId === 'main' && prev === null;
  await persistMessage(userMsg, setAsRoot);
  if (setAsRoot) {
    useTopicStore.getState().upsert({ ...topic!, rootMessageId: userId });
  }

  // Create assistant placeholder
  const assistantId = nanoid();
  const assistantMsg: Message = {
    id: assistantId,
    topicId,
    branchId,
    parentMessageId: userId,
    role: 'assistant',
    content: '',
    branchFrom: null,
    createdAt: Date.now() + 1,
  };
  ms.upsert(assistantMsg);
  await persistMessage(assistantMsg);
  ms.setStreaming(assistantId);

  try {
    const ctx = buildHistoryForBranch(topicId, branchId);
    // Drop the empty assistant placeholder from history sent to LLM
    const history = ctx.history.filter((m) => !(m.role === 'assistant' && m.content === ''));

    for await (const chunk of fetchStream('/api/chat', {
      messages: history,
      mode: ctx.selectedText ? 'branch' : 'teach',
      selectedText: ctx.selectedText ?? undefined,
      parentContext: ctx.parentContext || undefined,
    })) {
      ms.appendChunk(topicId, assistantId, chunk);
    }
  } finally {
    ms.setStreaming(null);
    const final = useMessageStore.getState().byTopic[topicId]?.[assistantId];
    if (final) await persistMessageContent(assistantId, final.content);
  }
  return { branchId, assistantId };
}

/** Convenience: create a new topic if none, with first user prompt as title. */
export async function ensureTopicAndSend(text: string): Promise<string> {
  const ui = useUiStore.getState();
  let topicId = ui.activeTopicId;
  if (!topicId) {
    const title = text.length > 24 ? text.slice(0, 24) + '…' : text;
    const t = await createTopic(title);
    topicId = t.id;
    ui.setActiveTopic(t.id);
  }
  await sendMessage({ topicId, branchId: 'main', text });
  return topicId;
}
