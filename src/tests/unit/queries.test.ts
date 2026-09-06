// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initDb, closeDb, getDb, SCHEMA_VERSION } from '@/lib/db/index';
import {
  createTopic,
  createMessage,
  deleteMessage,
  deleteMessageCascade,
  deleteTopic,
  getMessage,
  getTopic,
  listMessagesByTopic,
  listTopics,
  setTopicRoot,
  updateMessageContent,
  updateTopicTitle,
} from '@/lib/db/queries';

let clock = 0;
/** Monotonic timestamps so ordering assertions are deterministic. */
const at = () => 1_000 + clock++ * 10;

beforeEach(() => {
  closeDb();
  initDb(':memory:');
  clock = 0;
});

afterAll(() => closeDb());

describe('migrations', () => {
  const files: string[] = [];
  function tempDbPath() {
    const p = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'fymen-db-')),
      'test.db',
    );
    files.push(p);
    return p;
  }

  afterEach(() => {
    closeDb();
    for (const p of files.splice(0)) {
      // WAL leaves -wal/-shm siblings behind.
      for (const suffix of ['', '-wal', '-shm']) fs.rmSync(p + suffix, { force: true });
      fs.rmSync(path.dirname(p), { recursive: true, force: true });
    }
  });

  it('stamps user_version to the latest schema version', () => {
    expect(getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
  });

  it('is idempotent: reopening a database re-runs nothing and keeps the data', () => {
    const p = tempDbPath();
    closeDb();
    initDb(p);
    const topic = createTopic({ title: '第一次' });
    closeDb();

    initDb(p);
    expect(getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(getTopic(topic.id)?.title).toBe('第一次');
  });

  it('adopts a legacy database whose tables exist but user_version is 0', () => {
    const p = tempDbPath();
    closeDb();
    initDb(p);
    const topic = createTopic({ title: '旧库' });
    // What the pre-migration `CREATE TABLE IF NOT EXISTS` boot left behind.
    getDb().exec('PRAGMA user_version = 0');
    closeDb();

    // Re-running every migration over existing tables must not throw.
    initDb(p);
    expect(getDb().pragma('user_version', { simple: true })).toBe(SCHEMA_VERSION);
    expect(getTopic(topic.id)?.title).toBe('旧库');
  });

  it('enables foreign keys and WAL', () => {
    const db = getDb();
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    // :memory: cannot use WAL; assert on a real file instead.
    closeDb();
    initDb(tempDbPath());
    expect(getDb().pragma('journal_mode', { simple: true })).toBe('wal');
  });
});

describe('topics', () => {
  it('creates, lists, renames and deletes', () => {
    const a = createTopic({ title: 'A' });
    const b = createTopic({ title: 'B' });
    expect(listTopics().map((x) => x.id)).toEqual(expect.arrayContaining([a.id, b.id]));
    updateTopicTitle(a.id, 'A2');
    expect(getTopic(a.id)?.title).toBe('A2');
    deleteTopic(b.id);
    expect(getTopic(b.id)).toBeNull();
  });

  it('lists newest first', () => {
    const a = createTopic({ title: 'A' });
    const b = createTopic({ title: 'B' });
    const ids = listTopics().map((x) => x.id);
    // Same-millisecond creation is possible, so only assert both are present
    // and that ordering is by created_at DESC when the values differ.
    const ta = getTopic(a.id)!.createdAt;
    const tb = getTopic(b.id)!.createdAt;
    if (ta !== tb) expect(ids[0]).toBe(tb > ta ? b.id : a.id);
    expect(ids).toHaveLength(2);
  });

  it('deleting a topic removes its messages', () => {
    const topic = createTopic({ title: 'T' });
    createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'user',
      content: 'hi',
      createdAt: at(),
    });
    deleteTopic(topic.id);
    expect(listMessagesByTopic(topic.id)).toEqual([]);
  });
});

describe('messages', () => {
  it('round-trips branchFrom', () => {
    const topic = createTopic({ title: 'T' });
    const parent = createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'assistant',
      content: 'A',
      createdAt: at(),
    });
    const branch = createMessage({
      id: 'b1',
      topicId: topic.id,
      branchId: 'b1',
      parentMessageId: parent.id,
      role: 'user',
      content: '追问',
      branchFrom: { parentMessageId: parent.id, selectedText: '梯度' },
      createdAt: at(),
    });
    expect(getMessage(branch.id)?.branchFrom).toEqual({
      parentMessageId: parent.id,
      selectedText: '梯度',
    });
  });

  it('keeps branchFrom null when it was never set', () => {
    const topic = createTopic({ title: 'T' });
    const m = createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'user',
      content: 'hi',
      createdAt: at(),
    });
    expect(getMessage(m.id)?.branchFrom).toBeNull();
  });

  it('preserves an empty selectedText rather than dropping branchFrom', () => {
    const topic = createTopic({ title: 'T' });
    const parent = createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'assistant',
      content: 'A',
      createdAt: at(),
    });
    const b = createMessage({
      topicId: topic.id,
      branchId: 'bz',
      parentMessageId: parent.id,
      role: 'user',
      content: 'x',
      branchFrom: { parentMessageId: parent.id, selectedText: '' },
      createdAt: at(),
    });
    expect(getMessage(b.id)?.branchFrom).toEqual({
      parentMessageId: parent.id,
      selectedText: '',
    });
  });

  it('updates content', () => {
    const topic = createTopic({ title: 'T' });
    const m = createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'assistant',
      content: '',
      createdAt: at(),
    });
    updateMessageContent(m.id, 'streamed');
    expect(getMessage(m.id)?.content).toBe('streamed');
  });

  it('lists a topic ascending by createdAt', () => {
    const topic = createTopic({ title: 'T' });
    createMessage({
      id: 'second',
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'user',
      content: '2',
      createdAt: 200,
    });
    createMessage({
      id: 'first',
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'user',
      content: '1',
      createdAt: 100,
    });
    expect(listMessagesByTopic(topic.id).map((m) => m.id)).toEqual(['first', 'second']);
  });

  it('deleteMessage removes exactly one row', () => {
    const topic = createTopic({ title: 'T' });
    const m = createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'user',
      content: 'x',
      createdAt: at(),
    });
    createMessage({
      topicId: topic.id,
      branchId: 'main',
      parentMessageId: null,
      role: 'assistant',
      content: 'y',
      createdAt: at(),
    });
    deleteMessage(m.id);
    expect(listMessagesByTopic(topic.id)).toHaveLength(1);
  });
});

/**
 * Shape used by the cascade tests (`p` prefixes every id so two trees can
 * coexist in one database):
 *
 *   main:  u1 → a1 → u2 → a2
 *   b1 (anchored to a1) : b1u → b1a
 *   b2 (anchored to b1a): b2u        ← only reachable through b1
 *   b3 (anchored to a2) : b3u
 */
function seedTree(p = '') {
  const topic = createTopic({ title: 'T' });
  const mk = (
    id: string,
    branchId: string,
    role: 'user' | 'assistant',
    branchFrom?: { parentMessageId: string; selectedText: string },
  ) =>
    createMessage({
      id: p + id,
      topicId: topic.id,
      branchId: p + branchId,
      parentMessageId: null,
      role,
      content: id,
      branchFrom: branchFrom
        ? { parentMessageId: p + branchFrom.parentMessageId, selectedText: branchFrom.selectedText }
        : null,
      createdAt: at(),
    });

  mk('u1', 'main', 'user');
  mk('a1', 'main', 'assistant');
  mk('u2', 'main', 'user');
  mk('a2', 'main', 'assistant');
  mk('b1u', 'b1', 'user', { parentMessageId: 'a1', selectedText: 'X' });
  mk('b1a', 'b1', 'assistant');
  mk('b2u', 'b2', 'user', { parentMessageId: 'b1a', selectedText: 'Z' });
  mk('b3u', 'b3', 'user', { parentMessageId: 'a2', selectedText: 'W' });
  return topic;
}

const remaining = (topicId: string) =>
  listMessagesByTopic(topicId)
    .map((m) => m.id)
    .sort();

describe('deleteMessageCascade', () => {
  it('deletes the message, the rest of its branch, and every branch below', () => {
    const topic = seedTree();
    const deleted = deleteMessageCascade('u1');
    // u1 is the first main message, so the whole topic depends on it.
    expect(deleted.sort()).toEqual(['a1', 'a2', 'b1a', 'b1u', 'b2u', 'b3u', 'u1', 'u2']);
    expect(remaining(topic.id)).toEqual([]);
  });

  it('leaves earlier messages and the branches hanging off them alone', () => {
    const topic = seedTree();
    const deleted = deleteMessageCascade('u2');
    expect(deleted.sort()).toEqual(['a2', 'b3u', 'u2']);
    // u1/a1 predate u2, and b1 (plus its grandchild b2) is anchored to a1.
    expect(remaining(topic.id)).toEqual(['a1', 'b1a', 'b1u', 'b2u', 'u1']);
  });

  it('recurses: deleting a branch head kills grandchild branches', () => {
    const topic = seedTree();
    const deleted = deleteMessageCascade('b1u');
    expect(deleted.sort()).toEqual(['b1a', 'b1u', 'b2u']);
    expect(remaining(topic.id)).toEqual(['a1', 'a2', 'b3u', 'u1', 'u2']);
  });

  it('deletes only the tail of a branch when given its last message', () => {
    const topic = seedTree();
    const deleted = deleteMessageCascade('b1a');
    // b1a ends branch b1, but b2 is anchored to it.
    expect(deleted.sort()).toEqual(['b1a', 'b2u']);
    expect(remaining(topic.id)).toEqual(['a1', 'a2', 'b1u', 'b3u', 'u1', 'u2']);
  });

  it('clears the topic root pointer when the root message is deleted', () => {
    const topic = seedTree();
    setTopicRoot(topic.id, 'u1');
    expect(getTopic(topic.id)?.rootMessageId).toBe('u1');
    deleteMessageCascade('u1');
    expect(getTopic(topic.id)?.rootMessageId).toBeNull();
  });

  it('keeps the root pointer when an unrelated message is deleted', () => {
    const topic = seedTree();
    setTopicRoot(topic.id, 'u1');
    deleteMessageCascade('b3u');
    expect(getTopic(topic.id)?.rootMessageId).toBe('u1');
  });

  it('is a no-op for an unknown id', () => {
    const topic = seedTree();
    expect(deleteMessageCascade('nope')).toEqual([]);
    expect(listMessagesByTopic(topic.id)).toHaveLength(8);
  });

  it('does not touch other topics', () => {
    const a = seedTree('a-');
    const b = seedTree('b-');
    deleteMessageCascade('a-u1');
    expect(listMessagesByTopic(a.id)).toEqual([]);
    expect(listMessagesByTopic(b.id)).toHaveLength(8);
  });

  it('terminates when a branch is anchored to a message inside itself', () => {
    const topic = createTopic({ title: 'T' });
    // Defensive: a self-referential anchor must not loop forever.
    createMessage({
      id: 'c1',
      topicId: topic.id,
      branchId: 'cy',
      parentMessageId: null,
      role: 'user',
      content: 'c1',
      branchFrom: { parentMessageId: 'c1', selectedText: 'self' },
      createdAt: at(),
    });
    expect(deleteMessageCascade('c1')).toEqual(['c1']);
    expect(listMessagesByTopic(topic.id)).toEqual([]);
  });
});
