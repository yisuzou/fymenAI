import type { LLMProvider } from './types';
export function createMockProvider(chunks: string[]): LLMProvider {
  return {
    async *chatStream() { for (const c of chunks) yield c; },
  };
}
