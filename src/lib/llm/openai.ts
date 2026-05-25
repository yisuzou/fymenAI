import OpenAI from 'openai';
import type { LLMProvider, LLMMessage } from './types';

export function createOpenAIProvider(): LLMProvider {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const model = process.env.LLM_MODEL ?? 'gpt-4o-mini';
  return {
    async *chatStream(messages: LLMMessage[], opts = {}) {
      const stream = await client.chat.completions.create({
        model,
        messages,
        stream: true,
        temperature: opts.temperature ?? 0.7,
      });
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}
