import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let _db: Database.Database | null = null;
let _path: string | null = null;

export function initDb(p = process.env.DB_PATH ?? './data/feynman.db') {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  if (_db && _path === p) return _db;
  if (_db) _db.close();
  _db = new Database(p);
  _path = p;
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      root_message_id TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      topic_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      parent_message_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      branch_from_parent_id TEXT,
      branch_from_selected_text TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (topic_id) REFERENCES topics(id)
    );
    CREATE INDEX IF NOT EXISTS idx_messages_topic ON messages(topic_id);
    CREATE INDEX IF NOT EXISTS idx_messages_branch ON messages(topic_id, branch_id);
  `);
  return _db;
}

export function getDb() {
  if (!_db) return initDb();
  return _db;
}
