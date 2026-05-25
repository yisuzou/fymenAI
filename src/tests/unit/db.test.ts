import { describe, it, expect, beforeEach } from 'vitest';
import { initDb, getDb } from '@/lib/db';
import fs from 'node:fs';

const TEST_DB = './data/test.db';
beforeEach(() => { if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB); });

describe('db init', () => {
  it('creates threads, messages, knowledge_points tables', () => {
    initDb(TEST_DB);
    const db = getDb();
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table'"
    ).all().map((r: any) => r.name);
    expect(tables).toEqual(expect.arrayContaining(['threads', 'messages', 'knowledge_points']));
  });
});
