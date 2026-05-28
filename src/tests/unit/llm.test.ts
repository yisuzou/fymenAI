import { it, expect } from 'vitest';
import { createMockProvider } from '@/lib/llm/mock';

it('mock provider streams chunks', async () => {
  const p = createMockProvider(['Hel', 'lo', '!']);
  const chunks: string[] = [];
  for await (const c of p.chatStream([{ role: 'user', content: 'hi' }])) chunks.push(c);
  expect(chunks.join('')).toBe('Hello!');
});
