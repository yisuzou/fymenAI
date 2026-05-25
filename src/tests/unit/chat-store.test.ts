import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore } from '@/lib/store/chatStore';

beforeEach(() => useChatStore.getState().reset());

it('creates a root thread', () => {
  const id = useChatStore.getState().createThread({ title: '主对话' });
  const t = useChatStore.getState().threads[id];
  expect(t).toBeDefined();
  expect(t.parentThreadId).toBeNull();
});

it('spawns a sub-thread from a word', () => {
  const root = useChatStore.getState().createThread({ title: '主' });
  const msgId = useChatStore.getState().appendMessage(root, { role: 'assistant', content: '...闭包...' });
  const sub = useChatStore.getState().spawnSubThread({
    parentThreadId: root, parentMessageId: msgId, triggerWord: '闭包',
  });
  expect(useChatStore.getState().threads[sub].parentThreadId).toBe(root);
  expect(useChatStore.getState().threads[sub].triggerWord).toBe('闭包');
});
