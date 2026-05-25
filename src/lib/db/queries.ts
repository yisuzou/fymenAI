import { nanoid } from 'nanoid';
import { getDb } from './index';
import type { Message, Thread, KnowledgePoint, Role } from '@/lib/types';

export function createThread(input: Omit<Thread, 'id' | 'createdAt'>): Thread {
  const t: Thread = { id: nanoid(), createdAt: Date.now(), ...input };
  getDb().prepare(`INSERT INTO threads (id, parent_thread_id, parent_message_id, trigger_word, title, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    t.id, t.parentThreadId, t.parentMessageId, t.triggerWord, t.title, t.createdAt
  );
  return t;
}

export function addMessage(input: {
  threadId: string; role: Role; content: string; parentMessageId: string | null;
}): Message {
  const m: Message = { id: nanoid(), createdAt: Date.now(), ...input };
  getDb().prepare(`INSERT INTO messages (id, thread_id, parent_message_id, role, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    m.id, m.threadId, m.parentMessageId, m.role, m.content, m.createdAt
  );
  return m;
}

export function getThreadMessages(threadId: string): Message[] {
  return getDb().prepare(`SELECT id, thread_id as threadId, parent_message_id as parentMessageId,
    role, content, created_at as createdAt FROM messages WHERE thread_id = ? ORDER BY created_at ASC`)
    .all(threadId) as Message[];
}

export function getThread(threadId: string): Thread | null {
  const r = getDb().prepare(`SELECT id, parent_thread_id as parentThreadId,
    parent_message_id as parentMessageId, trigger_word as triggerWord, title, created_at as createdAt
    FROM threads WHERE id = ?`).get(threadId) as Thread | undefined;
  return r ?? null;
}

export function upsertKnowledge(kp: Omit<KnowledgePoint, 'id' | 'createdAt'> & { id?: string }): KnowledgePoint {
  const k: KnowledgePoint = { id: kp.id ?? nanoid(), createdAt: Date.now(), ...kp };
  getDb().prepare(`INSERT INTO knowledge_points (id, label, mastery, thread_id, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET mastery = excluded.mastery, label = excluded.label`)
    .run(k.id, k.label, k.mastery, k.threadId, k.createdAt);
  return k;
}

export function listKnowledge(): KnowledgePoint[] {
  return getDb().prepare(`SELECT id, label, mastery, thread_id as threadId, created_at as createdAt
    FROM knowledge_points ORDER BY created_at DESC`).all() as KnowledgePoint[];
}
