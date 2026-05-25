import type { LLMProvider } from './types';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
export * from './types';

export function getProvider(): LLMProvider {
  return (process.env.LLM_PROVIDER ?? 'openai') === 'anthropic'
    ? createAnthropicProvider() : createOpenAIProvider();
}
