// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, closeDb, getDb, SCHEMA_VERSION } from '@/lib/db/index';
import {
  getSetting,
  setSetting,
  deleteSetting,
  getAllSettings,
} from '@/lib/db/queries';
import {
  SETTING_KEYS,
  readLlmConfig,
  readLlmConfigView,
} from '@/lib/llm/config';
import { getProvider } from '@/lib/llm';

/**
 * The config resolver is the one place that decides which of three layers wins,
 * and it is the only thing standing between the browser and a plaintext API
 * key. Both properties are asserted here.
 */

// Env vars that participate in resolution. Cleared before each test so a real
// `.env` on the developer's machine cannot change the outcome.
const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'OPENAI_BASE_URL',
  'LLM_MAX_TOKENS',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'APP_TOKEN',
];

beforeEach(() => {
  closeDb();
  initDb(':memory:');
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  closeDb();
});

describe('settings table', () => {
  it('is created by migration v3 and counted in SCHEMA_VERSION', () => {
    const row = getDb()
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='settings'`)
      .get();
    expect(row).toBeTruthy();
    expect(SCHEMA_VERSION).toBeGreaterThanOrEqual(3);
  });

  it('round-trips a value', () => {
    setSetting('a', 'one');
    expect(getSetting('a')).toBe('one');
  });

  it('returns null for a key that was never written', () => {
    expect(getSetting('nope')).toBeNull();
  });

  it('overwrites rather than duplicating on a second write', () => {
    setSetting('a', 'one');
    setSetting('a', 'two');
    expect(getSetting('a')).toBe('two');
    const { n } = getDb().prepare(`SELECT COUNT(*) AS n FROM settings WHERE key='a'`).get() as {
      n: number;
    };
    expect(n).toBe(1);
  });

  it('deletes on an empty value instead of storing a blank', () => {
    // A stored blank would resolve as "settings layer has a value" and shadow a
    // perfectly good env var, which is the opposite of what clearing a field means.
    setSetting('a', 'one');
    setSetting('a', '');
    expect(getSetting('a')).toBeNull();
  });

  it('deleteSetting is a no-op on an absent key', () => {
    expect(() => deleteSetting('ghost')).not.toThrow();
  });

  it('getAllSettings returns every row as one object', () => {
    setSetting('a', '1');
    setSetting('b', '2');
    expect(getAllSettings()).toEqual({ a: '1', b: '2' });
  });

  it('stamps updated_at', () => {
    const before = Date.now();
    setSetting('a', '1');
    const { updated_at } = getDb()
      .prepare(`SELECT updated_at FROM settings WHERE key='a'`)
      .get() as { updated_at: number };
    expect(updated_at).toBeGreaterThanOrEqual(before);
  });
});

describe('readLlmConfig precedence', () => {
  it('falls back to built-in defaults with nothing configured', () => {
    const cfg = readLlmConfig();
    expect(cfg.provider).toBe('openai');
    expect(cfg.model).toBe('gpt-4o-mini');
    expect(cfg.baseUrl).toBeNull();
    expect(cfg.maxTokens).toBe(2048);
    expect(cfg.apiKey).toBeNull();
  });

  it('uses env when the settings table is empty', () => {
    vi.stubEnv('LLM_PROVIDER', 'anthropic');
    vi.stubEnv('LLM_MODEL', 'claude-from-env');
    vi.stubEnv('ANTHROPIC_API_KEY', 'env-key');
    const cfg = readLlmConfig();
    expect(cfg.provider).toBe('anthropic');
    expect(cfg.model).toBe('claude-from-env');
    expect(cfg.apiKey).toBe('env-key');
  });

  it('lets settings override env', () => {
    vi.stubEnv('LLM_MODEL', 'from-env');
    setSetting(SETTING_KEYS.model, 'from-settings');
    expect(readLlmConfig().model).toBe('from-settings');
  });

  it('treats a blank env var as unset', () => {
    // `LLM_MODEL=` in a .env file should not beat the default.
    vi.stubEnv('LLM_MODEL', '   ');
    expect(readLlmConfig().model).toBe('gpt-4o-mini');
  });

  it('falls back through an unparseable settings value', () => {
    vi.stubEnv('LLM_MAX_TOKENS', '999');
    setSetting(SETTING_KEYS.maxTokens, 'not-a-number');
    const cfg = readLlmConfig();
    expect(cfg.maxTokens).toBe(999);
  });

  it('rejects a negative maxTokens and keeps looking', () => {
    setSetting(SETTING_KEYS.maxTokens, '-5');
    expect(readLlmConfig().maxTokens).toBe(2048);
  });

  it('ignores an unknown provider string', () => {
    setSetting(SETTING_KEYS.provider, 'gemini');
    expect(readLlmConfig().provider).toBe('openai');
  });

  it('picks the default model for the provider actually in effect', () => {
    setSetting(SETTING_KEYS.provider, 'anthropic');
    expect(readLlmConfig().model).toBe('claude-3-5-sonnet-latest');
  });

  it('keeps a separate key per provider, so switching does not lose the other', () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-openai');
    setSetting(SETTING_KEYS.anthropicKey, 'sk-anthropic');

    setSetting(SETTING_KEYS.provider, 'openai');
    expect(readLlmConfig().apiKey).toBe('sk-openai');

    setSetting(SETTING_KEYS.provider, 'anthropic');
    expect(readLlmConfig().apiKey).toBe('sk-anthropic');

    // and back again — the OpenAI key was never touched
    setSetting(SETTING_KEYS.provider, 'openai');
    expect(readLlmConfig().apiKey).toBe('sk-openai');
  });

  it('reads the key env var matching the provider, not the other one', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai-env');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic-env');
    setSetting(SETTING_KEYS.provider, 'anthropic');
    expect(readLlmConfig().apiKey).toBe('sk-anthropic-env');
  });

  it('trims stored values', () => {
    setSetting(SETTING_KEYS.model, '  spaced  ');
    expect(readLlmConfig().model).toBe('spaced');
  });

  it('sees a change written after a previous read (no caching)', () => {
    // This is what makes the settings UI take effect without a restart.
    expect(readLlmConfig().model).toBe('gpt-4o-mini');
    setSetting(SETTING_KEYS.model, 'changed-live');
    expect(readLlmConfig().model).toBe('changed-live');
  });
});

describe('readLlmConfigView', () => {
  it('never carries the raw key, in any serialization', () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-super-secret-value-1234');
    const view = readLlmConfigView();
    expect('apiKey' in view).toBe(false);
    expect(JSON.stringify(view)).not.toContain('sk-super-secret-value-1234');
    expect(JSON.stringify(view)).not.toContain('super-secret');
  });

  it('exposes only the last four characters as a hint', () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-abcdefghij1234');
    const view = readLlmConfigView();
    expect(view.hasKey).toBe(true);
    expect(view.keyHint).toBe('····1234');
    expect(view.keyHint).not.toContain('abcdefghij');
  });

  it('reports no key when none is configured', () => {
    const view = readLlmConfigView();
    expect(view.hasKey).toBe(false);
    expect(view.keyHint).toBeNull();
  });

  it('hides a key that came from the environment just the same', () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-from-the-environment-9876');
    const view = readLlmConfigView();
    expect(view.hasKey).toBe(true);
    expect(view.keyHint).toBe('····9876');
    expect(JSON.stringify(view)).not.toContain('from-the-environment');
  });

  it('labels each field with the layer it came from', () => {
    vi.stubEnv('LLM_MODEL', 'from-env');
    setSetting(SETTING_KEYS.provider, 'anthropic');
    const { sources } = readLlmConfigView();
    expect(sources.provider).toBe('settings');
    expect(sources.model).toBe('env');
    expect(sources.baseUrl).toBe('default');
    expect(sources.maxTokens).toBe('default');
    expect(sources.apiKey).toBe('default');
  });

  it('reports appTokenRequired from the environment', () => {
    expect(readLlmConfigView().appTokenRequired).toBe(false);
    vi.stubEnv('APP_TOKEN', 'shhh');
    expect(readLlmConfigView().appTokenRequired).toBe(true);
  });

  it('does not leak APP_TOKEN itself', () => {
    vi.stubEnv('APP_TOKEN', 'the-app-token-value');
    expect(JSON.stringify(readLlmConfigView())).not.toContain('the-app-token-value');
  });
});

describe('getProvider', () => {
  it('builds a mock provider that streams without a key', async () => {
    const out: string[] = [];
    for await (const c of getProvider({
      provider: 'mock',
      model: 'mock',
      baseUrl: null,
      maxTokens: 100,
      apiKey: null,
    }).chatStream([{ role: 'user', content: 'hi' }])) {
      out.push(c);
    }
    expect(out.length).toBeGreaterThan(0);
    expect(out.join('')).toContain('Mock');
  });

  it('mock returns parseable JSON when json is requested, so grading works', async () => {
    let text = '';
    for await (const c of getProvider({
      provider: 'mock',
      model: 'mock',
      baseUrl: null,
      maxTokens: 100,
      apiKey: null,
    }).chatStream([{ role: 'user', content: 'hi' }], { json: true })) {
      text += c;
    }
    const parsed = JSON.parse(text) as { score: number };
    expect(typeof parsed.score).toBe('number');
  });

  it('builds an anthropic provider without calling out', () => {
    const p = getProvider({
      provider: 'anthropic',
      model: 'claude-3-5-sonnet-latest',
      baseUrl: null,
      maxTokens: 100,
      apiKey: 'sk-ant-test',
    });
    expect(typeof p.chatStream).toBe('function');
  });

  it('builds an openai provider for anything else', () => {
    const p = getProvider({
      provider: 'openai',
      model: 'gpt-4o-mini',
      baseUrl: 'https://gateway.example/v1',
      maxTokens: 100,
      apiKey: 'sk-test',
    });
    expect(typeof p.chatStream).toBe('function');
  });

  it('resolves config from the database when called with no argument', () => {
    setSetting(SETTING_KEYS.provider, 'mock');
    expect(typeof getProvider().chatStream).toBe('function');
  });
});
