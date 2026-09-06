import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage, LLMOptions } from './types';

export function createAnthropicProvider(): LLMProvider {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.LLM_MODEL ?? 'claude-3-5-sonnet-latest';
  const maxTokens = Number(process.env.LLM_MAX_TOKENS ?? 2048);
  return {
    async *chatStream(messages: LLMMessage[], opts: LLMOptions = {}) {
      const system = messages
        .filter((m) => m.role === 'system')
        .map((m) => m.content)
        .join('\n');
      const rest = messages.filter((m) => m.role !== 'system') as {
        role: 'user' | 'assistant';
        content: string;
      }[];

      // Anthropic has no JSON mode. Prefilling an opening brace makes the model
      // continue inside an object instead of wrapping it in prose. The prefill
      // is not echoed back in the stream, so re-emit it here to keep the
      // concatenated output parseable.
      const outbound = opts.json
        ? [...rest, { role: 'assistant' as const, content: '{' }]
        : rest;
      if (opts.json) yield '{';

      const stream = client.messages.stream({
        model,
        max_tokens: maxTokens,
        system,
        messages: outbound,
        temperature: opts.temperature ?? 0.7,
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          yield ev.delta.text;
        }
      }
    },
  };
}
