import { nanoid } from 'nanoid';
import { getDb } from './index';
import type { Message, Topic, Role, BranchInfo } from '@/lib/types';

interface RawMessage {
  id: string;
  topicId: string;
  branchId: string;
  parentMessageId: string | null;
  role: Role;
  content: string;
  branchFromParentId: string | null;
  branchFromSelectedText: string | null;
  createdAt: number;
}

function rowToMessage(r: RawMessage): Message {
  const branchFrom: BranchInfo | null =
    r.branchFromParentId && r.branchFromSelectedText !== null
      ? { parentMessageId: r.branchFromParentId, selectedText: r.branchFromSelectedText }
      : null;
  return {
    id: r.id,
    topicId: r.topicId,
    branchId: r.branchId,
    parentMessageId: r.parentMessageId,
    role: r.role,
    content: r.content,
    branchFrom,
    createdAt: r.createdAt,
  };
}

const MSG_COLS = `id, topic_id as topicId, branch_id as branchId,
  parent_message_id as parentMessageId, role, content,
  branch_from_parent_id as branchFromParentId,
  branch_from_selected_text as branchFromSelectedText,
  created_at as createdAt`;

export function createTopic(input: { title: string }): Topic {
  const t: Topic = { id: nanoid(), title: input.title, rootMessageId: null, createdAt: Date.now() };
  getDb().prepare(`INSERT INTO topics (id, title, root_message_id, created_at) VALUES (?, ?, ?, ?)`)
    .run(t.id, t.title, t.rootMessageId, t.createdAt);
  return t;
}

export function listTopics(): Topic[] {
  return getDb().prepare(
    `SELECT id, title, root_message_id as rootMessageId, created_at as createdAt
     FROM topics ORDER BY created_at DESC`
  ).all() as Topic[];
}

export function getTopic(id: string): Topic | null {
  const r = getDb().prepare(
    `SELECT id, title, root_message_id as rootMessageId, created_at as createdAt
     FROM topics WHERE id = ?`
  ).get(id) as Topic | undefined;
  return r ?? null;
}

export function setTopicRoot(topicId: string, rootMessageId: string) {
  getDb().prepare(`UPDATE topics SET root_message_id = ? WHERE id = ?`).run(rootMessageId, topicId);
}

export function updateTopicTitle(topicId: string, title: string) {
  getDb().prepare(`UPDATE topics SET title = ? WHERE id = ?`).run(title, topicId);
}

export function deleteTopic(topicId: string) {
  const db = getDb();
  db.prepare(`DELETE FROM messages WHERE topic_id = ?`).run(topicId);
  db.prepare(`DELETE FROM topics WHERE id = ?`).run(topicId);
}

export function createMessage(input: {
  id?: string;
  topicId: string;
  branchId: string;
  parentMessageId: string | null;
  role: Role;
  content: string;
  branchFrom?: BranchInfo | null;
  createdAt?: number;
}): Message {
  const m: Message = {
    id: input.id ?? nanoid(),
    topicId: input.topicId,
    branchId: input.branchId,
    parentMessageId: input.parentMessageId,
    role: input.role,
    content: input.content,
    branchFrom: input.branchFrom ?? null,
    createdAt: input.createdAt ?? Date.now(),
  };
  getDb().prepare(
    `INSERT INTO messages
     (id, topic_id, branch_id, parent_message_id, role, content,
      branch_from_parent_id, branch_from_selected_text, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    m.id, m.topicId, m.branchId, m.parentMessageId, m.role, m.content,
    m.branchFrom?.parentMessageId ?? null,
    m.branchFrom?.selectedText ?? null,
    m.createdAt,
  );
  return m;
}

export function updateMessageContent(id: string, content: string) {
  getDb().prepare(`UPDATE messages SET content = ? WHERE id = ?`).run(content, id);
}

export function deleteMessage(id: string) {
  getDb().prepare(`DELETE FROM messages WHERE id = ?`).run(id);
}

export function listMessagesByTopic(topicId: string): Message[] {
  const rows = getDb().prepare(
    `SELECT ${MSG_COLS} FROM messages WHERE topic_id = ? ORDER BY created_at ASC`
  ).all(topicId) as RawMessage[];
  return rows.map(rowToMessage);
}

export function getMessage(id: string): Message | null {
  const r = getDb().prepare(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`).get(id) as RawMessage | undefined;
  return r ? rowToMessage(r) : null;
}
