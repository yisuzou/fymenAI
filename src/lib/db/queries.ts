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

/**
 * Delete a message and everything that depends on it, in one transaction.
 *
 * A plain `DELETE FROM messages WHERE id = ?` orphaned data: later messages in
 * the same branch lost the turn they answered, and every follow-up branch
 * anchored to the deleted message still pointed at a row that no longer
 * existed — those branches then vanished from the tree while their rows stayed
 * in the database forever.
 *
 * Doomed set:
 *   1. the target message,
 *   2. every later message in the same branch (they continue the same thread),
 *   3. recursively, every branch anchored to any doomed message, in full.
 *
 * Returns the deleted ids so a client can prune its own cache.
 */
export function deleteMessageCascade(id: string): string[] {
  const db = getDb();
  const target = getMessage(id);
  if (!target) return [];
  const topicId = target.topicId;

  const tailStmt = db.prepare(
    `SELECT id FROM messages
     WHERE topic_id = ? AND branch_id = ? AND (created_at > ? OR id = ?)`,
  );
  const branchesFromStmt = db.prepare(
    `SELECT branch_id as branchId FROM messages
     WHERE topic_id = ? AND branch_from_parent_id = ?`,
  );
  const branchMessagesStmt = db.prepare(
    `SELECT id FROM messages WHERE topic_id = ? AND branch_id = ?`,
  );
  const deleteStmt = db.prepare(`DELETE FROM messages WHERE id = ?`);

  const run = db.transaction((): string[] => {
    const doomed = new Set<string>();
    const seenBranches = new Set<string>();
    const queue: string[] = [];

    for (const r of tailStmt.all(topicId, target.branchId, target.createdAt, target.id) as {
      id: string;
    }[]) {
      if (!doomed.has(r.id)) {
        doomed.add(r.id);
        queue.push(r.id);
      }
    }

    while (queue.length) {
      const messageId = queue.pop()!;
      for (const b of branchesFromStmt.all(topicId, messageId) as { branchId: string }[]) {
        if (seenBranches.has(b.branchId)) continue;
        seenBranches.add(b.branchId);
        for (const r of branchMessagesStmt.all(topicId, b.branchId) as { id: string }[]) {
          if (!doomed.has(r.id)) {
            doomed.add(r.id);
            queue.push(r.id);
          }
        }
      }
    }

    for (const messageId of doomed) deleteStmt.run(messageId);

    // The topic's root pointer must not survive its target.
    const topic = getTopic(topicId);
    if (topic?.rootMessageId && doomed.has(topic.rootMessageId)) {
      db.prepare(`UPDATE topics SET root_message_id = NULL WHERE id = ?`).run(topicId);
    }
    return [...doomed];
  });

  return run();
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

/* ------------------------------------------------------------------ settings */

/**
 * Runtime configuration written from the settings UI.
 *
 * An absent row and an empty value mean the same thing — "no override, fall
 * back to the environment" — so `setSetting(key, '')` deletes instead of
 * storing a blank that would shadow a real env var.
 */
export function getSetting(key: string): string | null {
  const r = getDb().prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return r?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  if (value === '') return deleteSetting(key);
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    )
    .run(key, value, Date.now());
}

export function deleteSetting(key: string): void {
  getDb().prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export function getAllSettings(): Record<string, string> {
  const rows = getDb().prepare(`SELECT key, value FROM settings`).all() as {
    key: string;
    value: string;
  }[];
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
