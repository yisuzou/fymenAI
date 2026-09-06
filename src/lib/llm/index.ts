import type { LLMProvider } from './types';
import { createOpenAIProvider } from './openai';
import { createAnthropicProvider } from './anthropic';
import { createMockProvider } from './mock';
import { readLlmConfig, type LlmConfig } from './config';
export * from './types';

/**
 * Build a provider from resolved configuration.
 *
 * The config is read fresh on every call (see `config.ts`), so changing it in
 * the settings UI takes effect on the next request without a restart.
 *
 * `mock` used to be documented in `.env.example` but never implemented here —
 * anything that was not `anthropic` fell through to OpenAI, so `mock` produced
 * a keyless OpenAI client and failed.
 */
export function getProvider(cfg: LlmConfig = readLlmConfig()): LLMProvider {
  switch (cfg.provider) {
    case 'anthropic':
      return createAnthropicProvider(cfg);
    case 'mock':
      return createMockProvider();
    default:
      return createOpenAIProvider(cfg);
  }
}
