import { nanoid } from 'nanoid';
import { useTopicStore } from './topicStore';
import { useMessageStore, selectMessagesOfBranch } from './messageStore';
import { useUiStore } from './uiStore';
import { streamEvents, ApiRequestError } from '@/lib/api/stream';
import { DEFAULT_TOPIC_TITLE, TITLE_MAX_CHARS } from '@/lib/constants';
import type { Message, Topic, BranchInfo } from '@/lib/types';

function reportError(e: unknown, fallback: string) {
  const message =
    e instanceof ApiRequestError
      ? e.message
      : e instanceof Error && e.message
        ? `${fallback}（${e.message}）`
        : fallback;
  useUiStore.getState().setLastError(message);
}

function isAbort(e: unknown): boolean {
  return e instanceof DOMException ? e.name === 'AbortError' : false;
}

/** Throw on a non-2xx so callers stop pretending a write succeeded. */
async function ensureOk(res: Response, what: string): Promise<Response> {
  if (res.ok) return res;
  let detail = '';
  try {
    const j = (await res.json()) as { message?: unknown };
    if (typeof j.message === 'string') detail = j.message;
  } catch {
    // ignore non-JSON bodies
  }
  throw new Error(detail || `${what} 失败（${res.status}）`);
}

/** Fetch all topics, then load messages of the active one. */
export async function loadAllTopics(): Promise<Topic[]> {
  try {
    const res = await ensureOk(await fetch('/api/topics'), '加载主题列表');
    const topics = (await res.json()) as Topic[];
    useTopicStore.getState().hydrate(topics);
    return topics;
  } catch (e) {
    reportError(e, '无法加载主题列表。');
    return [];
  }
}

export async function loadTopicMessages(topicId: string): Promise<Message[]> {
  try {
    const res = await ensureOk(await fetch(`/api/topics/${topicId}`), '加载对话');
    const data = (await res.json()) as { topic: Topic; messages: Message[] };
    useMessageStore.getState().hydrateTopic(topicId, data.messages);
    useTopicStore.getState().upsert(data.topic);
    return data.messages;
  } catch (e) {
    // Previously this returned [] silently, which is indistinguishable from an
    // empty topic — the user saw a blank conversation with no explanation.
    reportError(e, '无法加载该主题的对话。');
    return [];
  }
}

export async function createTopic(title: string): Promise<Topic> {
  const res = await ensureOk(
    await fetch('/api/topics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    }),
    '创建主题',
  );
  const t = (await res.json()) as Topic;
  useTopicStore.getState().upsert(t);
  useMessageStore.getState().hydrateTopic(t.id, []);
  return t;
}

export async function deleteTopic(topicId: string) {
  try {
    await ensureOk(await fetch(`/api/topics/${topicId}`, { method: 'DELETE' }), '删除主题');
  } catch (e) {
    reportError(e, '删除主题失败。');
    return;
  }
  useTopicStore.getState().remove(topicId);
  const ui = useUiStore.getState();
  if (ui.activeTopicId === topicId) ui.setActiveTopic(null);
}

async function persistMessage(m: Message, setAsRoot = false) {
  await ensureOk(
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...m, setAsRoot }),
    }),
    '保存消息',
  );
}

async function persistMessageContent(id: string, content: string) {
  await ensureOk(
    await fetch(`/api/messages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content }),
    }),
    '保存消息',
  );
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
  const history = branchMsgs
    .filter((m) => m.role !== 'system')
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  if (branchId === 'main') {
    return { history, parentContext: '', selectedText: null };
  }

  const branchFrom = branchMsgs[0]?.branchFrom;
  if (!branchFrom) {
    return { history, parentContext: '', selectedText: null };
  }

  return {
    history,
    parentContext: byTopic[branchFrom.parentMessageId]?.content ?? '',
    selectedText: branchFrom.selectedText,
  };
}

/**
 * In-flight streams, keyed by the assistant message being written into, so the
 * UI can cancel one. Without this, a request kept consuming provider tokens
 * after the user had already moved on, and there was no way to stop a runaway
 * generation.
 */
const inFlight = new Map<string, AbortController>();

/** Cancel one in-flight stream, or all of them when `assistantId` is omitted. */
export function stopStreaming(assistantId?: string) {
  if (assistantId) {
    inFlight.get(assistantId)?.abort();
    inFlight.delete(assistantId);
    return;
  }
  for (const c of inFlight.values()) c.abort();
  inFlight.clear();
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
  useUiStore.getState().setLastError(null);

  // Dedup: if this call would create a NEW branch with the same
  // (parentMessageId, selectedText) as an existing branch, do not create a
  // duplicate. Return the existing branch's ids so callers can focus it.
  if (opts.newBranch) {
    const tStore = ms.byTopic[topicId] ?? {};
    for (const id in tStore) {
      const m = tStore[id];
      if (
        m.branchFrom &&
        m.branchFrom.parentMessageId === opts.newBranch.parentMessageId &&
        m.branchFrom.selectedText === opts.newBranch.selectedText
      ) {
        let existingAssistantId = '';
        for (const id2 in tStore) {
          const m2 = tStore[id2];
          if (m2.branchId === m.branchId && m2.role === 'assistant') {
            existingAssistantId = m2.id;
            break;
          }
        }
        return { branchId: m.branchId, assistantId: existingAssistantId };
      }
    }
  }

  // Compute the actual branchId
  const userId = nanoid();
  const branchId = opts.newBranch ? userId : opts.branchId;

  // Find last message in this (possibly new) branch
  const prev = opts.newBranch ? null : lastMessageOfBranch(topicId, branchId);

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

  const assistantId = nanoid();
  try {
    await persistMessage(userMsg, setAsRoot);
  } catch (e) {
    // The optimistic message is already on screen; roll it back rather than
    // leaving a message that exists only in the browser.
    ms.remove(topicId, userId);
    reportError(e, '消息未能保存，请重试。');
    return { branchId, assistantId };
  }
  if (setAsRoot && topic) {
    useTopicStore.getState().upsert({ ...topic, rootMessageId: userId });
  }

  // Create assistant placeholder
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
  try {
    await persistMessage(assistantMsg);
  } catch (e) {
    ms.remove(topicId, assistantId);
    reportError(e, '消息未能保存，请重试。');
    return { branchId, assistantId };
  }
  ms.setStreaming(assistantId);

  const controller = new AbortController();
  inFlight.set(assistantId, controller);

  try {
    const ctx = buildHistoryForBranch(topicId, branchId);
    // Drop the empty assistant placeholder from history sent to LLM
    const history = ctx.history.filter((m) => !(m.role === 'assistant' && m.content === ''));

    for await (const ev of streamEvents(
      '/api/chat',
      {
        messages: history,
        mode: ctx.selectedText ? 'branch' : 'teach',
        selectedText: ctx.selectedText ?? undefined,
        parentContext: ctx.parentContext || undefined,
      },
      { signal: controller.signal },
    )) {
      if (ev.t === 'delta') {
        ms.appendChunk(topicId, assistantId, ev.v);
      } else if (ev.t === 'error') {
        // Never write a failure into the message body — it would be persisted
        // and read back as if the model had said it.
        useUiStore.getState().setLastError(ev.message);
        break;
      } else {
        break; // done
      }
    }
  } catch (e) {
    if (!isAbort(e)) reportError(e, '生成失败，请稍后重试。');
  } finally {
    inFlight.delete(assistantId);
    ms.setStreaming(null);
    const final = useMessageStore.getState().byTopic[topicId]?.[assistantId];
    // Persist whatever arrived, including a partial answer after a stop.
    if (final) {
      try {
        await persistMessageContent(assistantId, final.content);
      } catch (e) {
        reportError(e, '回复未能保存。');
      }
    }
  }
  return { branchId, assistantId };
}

/** Convenience: create a new topic if none, with first user prompt as title. */
export async function ensureTopicAndSend(text: string): Promise<string | null> {
  const ui = useUiStore.getState();
  let topicId = ui.activeTopicId;
  const derivedTitle =
    text.length > TITLE_MAX_CHARS ? text.slice(0, TITLE_MAX_CHARS) + '…' : text;
  if (!topicId) {
    try {
      const t = await createTopic(derivedTitle);
      topicId = t.id;
      ui.setActiveTopic(t.id);
    } catch (e) {
      reportError(e, '创建主题失败。');
      return null;
    }
  } else {
    const existing = useTopicStore.getState().topics[topicId];
    if (existing && existing.title === DEFAULT_TOPIC_TITLE) {
      useTopicStore.getState().rename(topicId, derivedTitle);
      void fetch(`/api/topics/${topicId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: derivedTitle }),
      }).catch(() => {
        /* title is cosmetic; the local rename already applied */
      });
    }
  }
  await sendMessage({ topicId, branchId: 'main', text });
  return topicId;
}
