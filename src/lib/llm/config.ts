import { getAllSettings } from '@/lib/db/queries';

/**
 * Single point where LLM configuration is resolved.
 *
 * Three layers, highest first:
 *   1. `settings` table — written from the UI
 *   2. environment variables — what a deployment starts with
 *   3. built-in defaults
 *
 * Read per request rather than cached: a SQLite read on a local file is
 * sub-millisecond, and reading fresh is what makes a change in the UI take
 * effect without restarting the server.
 */

export type ProviderId = 'openai' | 'anthropic' | 'mock';
export type ConfigSource = 'settings' | 'env' | 'default';

/** Settings-table keys. Kept here so the route and the resolver cannot drift. */
export const SETTING_KEYS = {
  provider: 'llm_provider',
  model: 'llm_model',
  baseUrl: 'llm_base_url',
  maxTokens: 'llm_max_tokens',
  openaiKey: 'openai_api_key',
  anthropicKey: 'anthropic_api_key',
} as const;

const DEFAULT_MODEL: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  mock: 'mock',
};

const DEFAULT_MAX_TOKENS = 2048;

/** Server-side shape. Carries the plaintext key and must never be serialized. */
export interface LlmConfig {
  provider: ProviderId;
  model: string;
  baseUrl: string | null;
  maxTokens: number;
  apiKey: string | null;
}

type Field = 'provider' | 'model' | 'baseUrl' | 'maxTokens' | 'apiKey';

/**
 * Browser-facing shape. Structurally incapable of carrying the key: there is no
 * field for it, only whether one exists and its last four characters.
 */
export interface LlmConfigView {
  provider: ProviderId;
  model: string;
  baseUrl: string | null;
  maxTokens: number;
  hasKey: boolean;
  keyHint: string | null;
  sources: Record<Field, ConfigSource>;
  /** Whether `APP_TOKEN` is set, so the UI knows to ask for one. */
  appTokenRequired: boolean;
}

function isProvider(v: string | undefined | null): v is ProviderId {
  return v === 'openai' || v === 'anthropic' || v === 'mock';
}

/** Treat a blank env var as unset — `LLM_MODEL=` should not win over a default. */
function env(name: string): string | null {
  const v = process.env[name];
  return v && v.trim() !== '' ? v : null;
}

/** Pick the first layer that has a value, and report which one it was. */
function resolve<T>(
  fromSettings: string | null,
  fromEnv: string | null,
  fallback: T,
  parse: (raw: string) => T | null,
): { value: T; source: ConfigSource } {
  if (fromSettings !== null) {
    const parsed = parse(fromSettings);
    if (parsed !== null) return { value: parsed, source: 'settings' };
  }
  if (fromEnv !== null) {
    const parsed = parse(fromEnv);
    if (parsed !== null) return { value: parsed, source: 'env' };
  }
  return { value: fallback, source: 'default' };
}

const asString = (raw: string): string | null => (raw.trim() === '' ? null : raw.trim());

function asPositiveInt(raw: string): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

interface Resolved {
  config: LlmConfig;
  sources: Record<Field, ConfigSource>;
}

function resolveAll(): Resolved {
  const s = getAllSettings();

  const provider = resolve<ProviderId>(
    s[SETTING_KEYS.provider] ?? null,
    env('LLM_PROVIDER'),
    'openai',
    (raw) => (isProvider(raw.trim()) ? (raw.trim() as ProviderId) : null),
  );

  const model = resolve<string>(
    s[SETTING_KEYS.model] ?? null,
    env('LLM_MODEL'),
    DEFAULT_MODEL[provider.value],
    asString,
  );

  const baseUrl = resolve<string | null>(
    s[SETTING_KEYS.baseUrl] ?? null,
    env('OPENAI_BASE_URL'),
    null,
    asString,
  );

  const maxTokens = resolve<number>(
    s[SETTING_KEYS.maxTokens] ?? null,
    env('LLM_MAX_TOKENS'),
    DEFAULT_MAX_TOKENS,
    asPositiveInt,
  );

  // Each provider keeps its own key, so switching provider and back does not
  // lose the other one.
  const keyField = provider.value === 'anthropic' ? SETTING_KEYS.anthropicKey : SETTING_KEYS.openaiKey;
  const keyEnv = provider.value === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY';
  const apiKey = resolve<string | null>(s[keyField] ?? null, env(keyEnv), null, asString);

  return {
    config: {
      provider: provider.value,
      model: model.value,
      baseUrl: baseUrl.value,
      maxTokens: maxTokens.value,
      apiKey: apiKey.value,
    },
    sources: {
      provider: provider.source,
      model: model.source,
      baseUrl: baseUrl.source,
      maxTokens: maxTokens.source,
      apiKey: apiKey.source,
    },
  };
}

export function readLlmConfig(): LlmConfig {
  return resolveAll().config;
}

/** Last four characters of a key, enough to recognise which one is stored. */
function hint(key: string): string {
  return `····${key.slice(-4)}`;
}

export function readLlmConfigView(): LlmConfigView {
  const { config, sources } = resolveAll();
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    maxTokens: config.maxTokens,
    hasKey: config.apiKey !== null,
    keyHint: config.apiKey ? hint(config.apiKey) : null,
    sources,
    appTokenRequired: !!env('APP_TOKEN'),
  };
}
