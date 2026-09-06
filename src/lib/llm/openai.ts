import OpenAI from 'openai';
import type { LLMProvider, LLMMessage, LLMOptions } from './types';
import type { LlmConfig } from './config';

export function createOpenAIProvider(cfg: LlmConfig): LLMProvider {
  const client = new OpenAI({
    apiKey: cfg.apiKey ?? undefined,
    baseURL: cfg.baseUrl ?? undefined,
  });
  return {
    async *chatStream(messages: LLMMessage[], opts: LLMOptions = {}) {
      const stream = await client.chat.completions.create(
        {
          model: cfg.model,
          messages,
          stream: true,
          temperature: opts.temperature ?? 0.7,
          ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
        },
        { signal: opts.signal },
      );
      for await (const part of stream) {
        const delta = part.choices[0]?.delta?.content;
        if (delta) yield delta;
      }
    },
  };
}
