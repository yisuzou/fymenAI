import { describe, it, expect, beforeEach } from 'vitest';
import { initDb } from '@/lib/db';
import { createThread, addMessage, getThreadMessages } from '@/lib/db/queries';
import fs from 'node:fs';

const TEST_DB = './data/test-q.db';
beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  initDb(TEST_DB);
});

it('creates thread and appends messages', () => {
  const t = createThread({ title: 'root', parentThreadId: null, parentMessageId: null, triggerWord: null });
  addMessage({ threadId: t.id, role: 'user', content: 'hi', parentMessageId: null });
  addMessage({ threadId: t.id, role: 'assistant', content: 'hello', parentMessageId: null });
  expect(getThreadMessages(t.id)).toHaveLength(2);
});
