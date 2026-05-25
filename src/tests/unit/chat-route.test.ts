import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/llm', () => ({
  getProvider: () => ({
    async *chatStream() { yield 'A'; yield 'B'; },
  }),
}));
import { POST } from '@/app/api/chat/route';

it('streams text', async () => {
  const req = new Request('http://x/api/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
  });
  const res = await POST(req as any);
  const text = await res.text();
  expect(text).toContain('A');
  expect(text).toContain('B');
});
