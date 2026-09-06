import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let _db: Database.Database | null = null;
let _path: string | null = null;

/**
 * Schema history. Each entry runs exactly once per database, in order, inside a
 * transaction, and bumps `PRAGMA user_version`.
 *
 * Before this, `initDb` ran one `CREATE TABLE IF NOT EXISTS` block on every
 * boot: any change to an existing table was silently skipped, so a schema edit
 * worked on a fresh database and did nothing on an existing one. Statements in
 * version 1 stay `IF NOT EXISTS` so databases created by that old code (which
 * left `user_version` at 0) can adopt the history without erroring.
 */
const MIGRATIONS: { version: number; up: (db: Database.Database) => void }[] = [
  {
    version: 1,
    up: (db) =>
      db.exec(`
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
      `),
  },
  {
    version: 2,
    // Cascade deletion walks from a message to the branches hanging off it;
    // without this index that walk is a full scan per level.
    up: (db) =>
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_messages_branch_from
          ON messages(topic_id, branch_from_parent_id);
      `),
  },
];

export const SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

function runMigrations(db: Database.Database) {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const m of MIGRATIONS) {
    if (m.version <= current) continue;
    db.transaction(() => {
      m.up(db);
      // Same transaction as the change itself: an interrupted migration leaves
      // neither the schema edit nor the version bump behind.
      db.exec(`PRAGMA user_version = ${m.version}`);
    })();
  }
}

export function initDb(p = process.env.DB_PATH ?? './data/feynman.db') {
  if (_db && _path === p) return _db;
  if (p !== ':memory:') fs.mkdirSync(path.dirname(p), { recursive: true });
  if (_db) _db.close();
  _db = new Database(p);
  _path = p;
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  runMigrations(_db);
  return _db;
}

export function getDb() {
  if (!_db) return initDb();
  return _db;
}

/** Test helper: drop the cached handle so the next `initDb` reopens. */
export function closeDb() {
  if (_db) _db.close();
  _db = null;
  _path = null;
}
