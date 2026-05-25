import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, LLMMessage } from './types';

export function createAnthropicProvider(): LLMProvider {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = process.env.LLM_MODEL ?? 'claude-3-5-sonnet-latest';
  return {
    async *chatStream(messages: LLMMessage[], opts = {}) {
      const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n');
      const rest = messages.filter(m => m.role !== 'system') as { role: 'user' | 'assistant'; content: string }[];
      const stream = client.messages.stream({
        model, max_tokens: 2048, system, messages: rest,
        temperature: opts.temperature ?? 0.7,
      });
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') yield ev.delta.text;
      }
    },
  };
}
