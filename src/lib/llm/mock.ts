import type { LLMProvider, LLMOptions } from './types';

const CANNED = [
  '（Mock 模式）',
  '这是一段本地生成的示例回答，',
  '不会调用任何真实模型，也不需要 API Key。',
  '把 provider 改成 OpenAI 或 Anthropic 并填入 Key 后即可接真实模型。',
];

/** The grader needs a parseable object, not prose, even in mock mode. */
const CANNED_GRADE = [
  '{"score": 72, "correct": ["Mock 模式不会调用真实模型"], ',
  '"missing": ["换成真实 provider 后才能得到真正的评分"], "wrong": []}',
];

/**
 * Streams canned text. Used by tests and by the `mock` provider setting, which
 * lets someone try the whole UI before they have an API key.
 *
 * `chunks` overrides both scripts, which is what the tests use.
 */
export function createMockProvider(chunks?: string[]): LLMProvider {
  return {
    async *chatStream(_messages, opts: LLMOptions = {}) {
      for (const c of chunks ?? (opts.json ? CANNED_GRADE : CANNED)) yield c;
    },
  };
}
