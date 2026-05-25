import { useKnowledgeStore } from '@/lib/store/knowledgeStore';
import { beforeEach, it, expect } from 'vitest';

beforeEach(() => useKnowledgeStore.getState().reset());

it('records and updates mastery', () => {
  const id = useKnowledgeStore.getState().add({ label: '闭包', threadId: 't1' });
  useKnowledgeStore.getState().setMastery(id, 0.8);
  expect(useKnowledgeStore.getState().points[id].mastery).toBe(0.8);
});
