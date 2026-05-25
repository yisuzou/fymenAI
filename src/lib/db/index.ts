import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let _db: Database.Database | null = null;

export function initDb(p = process.env.DB_PATH ?? './data/feynman.db') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  _db = new Database(p);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      parent_thread_id TEXT,
      parent_message_id TEXT,
      trigger_word TEXT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      parent_message_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (thread_id) REFERENCES threads(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE TABLE IF NOT EXISTS knowledge_points (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      mastery REAL NOT NULL DEFAULT 0,
      thread_id TEXT,
      created_at INTEGER NOT NULL
    );
  `);
  return _db;
}

export function getDb() {
  if (!_db) return initDb();
  return _db;
}
