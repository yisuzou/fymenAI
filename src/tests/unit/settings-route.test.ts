// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initDb, closeDb } from '@/lib/db/index';
import { getSetting, setSetting } from '@/lib/db/queries';
import { resetRateLimit } from '@/lib/api/guard';
import { SETTING_KEYS } from '@/lib/llm/config';

/**
 * The settings endpoints are the only writable configuration surface, and
 * `/api/settings/test` is the only one that makes an outbound call on demand.
 * These tests pin the three things that matter: the key never comes back out,
 * bad input is rejected before it is stored, and a raw provider error never
 * reaches the browser.
 */

// A controllable provider, so the test endpoint never touches the network.
const provider = vi.hoisted(() => ({
  chunks: ['pong'] as string[],
  error: null as unknown,
}));

vi.mock('@/lib/llm', () => ({
  getProvider: () => ({
    async *chatStream() {
      if (provider.error) throw provider.error;
      for (const c of provider.chunks) yield c;
    },
  }),
}));

const { GET, PUT } = await import('@/app/api/settings/route');
const { POST: TEST_POST } = await import('@/app/api/settings/test/route');

const ENV_KEYS = [
  'LLM_PROVIDER',
  'LLM_MODEL',
  'OPENAI_BASE_URL',
  'LLM_MAX_TOKENS',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'APP_TOKEN',
];

interface View {
  provider: string;
  model: string;
  baseUrl: string | null;
  maxTokens: number;
  hasKey: boolean;
  keyHint: string | null;
  sources: Record<string, string>;
  appTokenRequired: boolean;
}

function get(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/settings', { headers });
}

function put(body: unknown, headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function testReq(headers: Record<string, string> = {}) {
  return new Request('http://localhost/api/settings/test', { method: 'POST', headers });
}

// The routes are typed against NextRequest but only touch `headers` and `json`,
// both of which a plain Request provides.
type Req = Parameters<typeof GET>[0];
const asReq = (r: Request) => r as unknown as Req;

beforeEach(() => {
  closeDb();
  initDb(':memory:');
  resetRateLimit();
  for (const k of ENV_KEYS) vi.stubEnv(k, '');
  provider.chunks = ['pong'];
  provider.error = null;
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  closeDb();
});

describe('GET /api/settings', () => {
  it('returns the current view', async () => {
    const res = await GET(asReq(get()));
    expect(res.status).toBe(200);
    const body = (await res.json()) as View;
    expect(body.provider).toBe('openai');
    expect(body.sources.provider).toBe('default');
  });

  it('never includes the API key, from either layer', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-stored-secret-1111');
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-env-secret-2222');
    const text = await (await GET(asReq(get()))).text();
    expect(text).not.toContain('sk-stored-secret-1111');
    expect(text).not.toContain('sk-env-secret-2222');
    expect(text).not.toContain('stored-secret');
    // Only the hint survives.
    expect(text).toContain('1111');
  });
});

describe('PUT /api/settings', () => {
  it('stores an override and reports it as coming from settings', async () => {
    const res = await PUT(asReq(put({ model: 'my-model' })));
    expect(res.status).toBe(200);
    const body = (await res.json()) as View;
    expect(body.model).toBe('my-model');
    expect(body.sources.model).toBe('settings');
  });

  it('returns the updated view so the client needs no second GET', async () => {
    const body = (await (await PUT(asReq(put({ provider: 'anthropic' })))).json()) as View;
    expect(body.provider).toBe('anthropic');
    expect(body.model).toBe('claude-3-5-sonnet-latest');
  });

  it('leaves a field unchanged when it is absent from the body', async () => {
    await PUT(asReq(put({ model: 'keep-me' })));
    await PUT(asReq(put({ provider: 'openai' })));
    expect(getSetting(SETTING_KEYS.model)).toBe('keep-me');
  });

  it('drops the override on an empty string, falling back to env', async () => {
    vi.stubEnv('LLM_MODEL', 'from-env');
    await PUT(asReq(put({ model: 'override' })));
    const body = (await (await PUT(asReq(put({ model: '' })))).json()) as View;
    expect(body.model).toBe('from-env');
    expect(body.sources.model).toBe('env');
    expect(getSetting(SETTING_KEYS.model)).toBeNull();
  });

  it('deletes the stored key on apiKey: null', async () => {
    await PUT(asReq(put({ apiKey: 'sk-to-be-removed' })));
    expect(getSetting(SETTING_KEYS.openaiKey)).toBe('sk-to-be-removed');
    const body = (await (await PUT(asReq(put({ apiKey: null })))).json()) as View;
    expect(body.hasKey).toBe(false);
    expect(getSetting(SETTING_KEYS.openaiKey)).toBeNull();
  });

  it('an empty apiKey string also clears it', async () => {
    await PUT(asReq(put({ apiKey: 'sk-x' })));
    await PUT(asReq(put({ apiKey: '   ' })));
    expect(getSetting(SETTING_KEYS.openaiKey)).toBeNull();
  });

  it('writes the key to the provider being switched to in the same request', async () => {
    await PUT(asReq(put({ provider: 'anthropic', apiKey: 'sk-ant-value' })));
    expect(getSetting(SETTING_KEYS.anthropicKey)).toBe('sk-ant-value');
    expect(getSetting(SETTING_KEYS.openaiKey)).toBeNull();
  });

  it('writes the key to the already-saved provider when none is posted', async () => {
    setSetting(SETTING_KEYS.provider, 'anthropic');
    await PUT(asReq(put({ apiKey: 'sk-ant-only' })));
    expect(getSetting(SETTING_KEYS.anthropicKey)).toBe('sk-ant-only');
  });

  it('does not echo the key it just stored', async () => {
    const text = await (await PUT(asReq(put({ apiKey: 'sk-echo-check-3333' })))).text();
    expect(text).not.toContain('sk-echo-check-3333');
    expect(text).toContain('3333');
  });

  it('rejects a non-http baseUrl', async () => {
    const res = await PUT(asReq(put({ baseUrl: 'file:///etc/passwd' })));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('invalid_request');
    expect(getSetting(SETTING_KEYS.baseUrl)).toBeNull();
  });

  it('rejects a baseUrl that is not a URL at all', async () => {
    expect((await PUT(asReq(put({ baseUrl: 'not a url' })))).status).toBe(400);
  });

  it('accepts an empty baseUrl as "clear it"', async () => {
    await PUT(asReq(put({ baseUrl: 'https://gw.example/v1' })));
    const body = (await (await PUT(asReq(put({ baseUrl: '' })))).json()) as View;
    expect(body.baseUrl).toBeNull();
  });

  it('rejects maxTokens out of range', async () => {
    expect((await PUT(asReq(put({ maxTokens: 0 })))).status).toBe(400);
    expect((await PUT(asReq(put({ maxTokens: 500_000 })))).status).toBe(400);
    expect((await PUT(asReq(put({ maxTokens: 1.5 })))).status).toBe(400);
  });

  it('rejects an unknown provider', async () => {
    expect((await PUT(asReq(put({ provider: 'gemini' })))).status).toBe(400);
    expect(getSetting(SETTING_KEYS.provider)).toBeNull();
  });

  it('rejects an over-long key', async () => {
    expect((await PUT(asReq(put({ apiKey: 'x'.repeat(501) })))).status).toBe(400);
  });

  it('rejects a malformed JSON body without throwing', async () => {
    const res = await PUT(asReq(put('{ not json')));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { code: string }).code).toBe('invalid_json');
  });
});

describe('APP_TOKEN gate', () => {
  it('is inactive when unset', async () => {
    expect((await GET(asReq(get()))).status).toBe(200);
  });

  it('rejects GET without a token', async () => {
    vi.stubEnv('APP_TOKEN', 'secret');
    const res = await GET(asReq(get()));
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe('unauthorized');
  });

  it('rejects PUT without a token, and stores nothing', async () => {
    vi.stubEnv('APP_TOKEN', 'secret');
    expect((await PUT(asReq(put({ model: 'sneaky' })))).status).toBe(401);
    expect(getSetting(SETTING_KEYS.model)).toBeNull();
  });

  it('rejects a wrong token', async () => {
    vi.stubEnv('APP_TOKEN', 'secret');
    expect((await GET(asReq(get({ authorization: 'Bearer wrong' })))).status).toBe(401);
  });

  it('accepts the right token', async () => {
    vi.stubEnv('APP_TOKEN', 'secret');
    expect((await GET(asReq(get({ authorization: 'Bearer secret' })))).status).toBe(200);
  });

  it('rejects PUT before parsing the body', async () => {
    // An unauthorized caller should not even get validation feedback.
    vi.stubEnv('APP_TOKEN', 'secret');
    expect((await PUT(asReq(put('{ not json')))).status).toBe(401);
  });

  it('gates the test endpoint too', async () => {
    vi.stubEnv('APP_TOKEN', 'secret');
    expect((await TEST_POST(asReq(testReq()))).status).toBe(401);
  });
});

describe('POST /api/settings/test', () => {
  it('reports success with provider, model and latency', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    const body = (await (await TEST_POST(asReq(testReq()))).json()) as {
      ok: boolean;
      provider: string;
      model: string;
      latencyMs: number;
    };
    expect(body.ok).toBe(true);
    expect(body.provider).toBe('openai');
    expect(body.model).toBe('gpt-4o-mini');
    expect(typeof body.latencyMs).toBe('number');
  });

  it('needs no key in mock mode', async () => {
    setSetting(SETTING_KEYS.provider, 'mock');
    const body = (await (await TEST_POST(asReq(testReq()))).json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it('reports no_key before making any call', async () => {
    provider.error = new Error('should never be reached');
    const body = (await (await TEST_POST(asReq(testReq()))).json()) as {
      ok: boolean;
      code: string;
    };
    expect(body.ok).toBe(false);
    expect(body.code).toBe('no_key');
  });

  it.each([
    [{ status: 401 }, 'invalid_key'],
    [{ status: 403 }, 'invalid_key'],
    [{ status: 404 }, 'model_not_found'],
    [{ status: 429 }, 'rate_limited'],
    [{ code: 'ENOTFOUND' }, 'network'],
    [{ code: 'ECONNREFUSED' }, 'network'],
    [{ message: 'fetch failed' }, 'network'],
    [{ status: 500 }, 'unknown'],
  ])('maps %o to code %s', async (shape, expected) => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    provider.error = Object.assign(new Error('boom'), shape);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const body = (await (await TEST_POST(asReq(testReq()))).json()) as { code: string };
    expect(body.code).toBe(expected);
  });

  it('answers 200 on a provider failure — the request itself worked', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    provider.error = Object.assign(new Error('boom'), { status: 401 });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect((await TEST_POST(asReq(testReq()))).status).toBe(200);
  });

  it('never puts the raw provider error in the response', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    provider.error = new Error(
      'Incorrect API key sk-live-abcdef provided; see https://internal.example/keys',
    );
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const text = await (await TEST_POST(asReq(testReq()))).text();
    expect(text).not.toContain('sk-live-abcdef');
    expect(text).not.toContain('internal.example');
    expect(text).toContain('unknown');
    // It is still logged server-side, where the operator can see it.
    expect(spy).toHaveBeenCalled();
  });

  it('limits to 5 calls per minute in its own bucket', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    const h = { 'x-forwarded-for': '9.9.9.9' };
    for (let i = 0; i < 5; i++) {
      expect((await TEST_POST(asReq(testReq(h)))).status).toBe(200);
    }
    const res = await TEST_POST(asReq(testReq(h)));
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBeTruthy();
  });

  it('spending the test budget does not block reading settings', async () => {
    // Separate namespaces: opening the dialog should still work after testing.
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    const h = { 'x-forwarded-for': '8.8.8.8' };
    for (let i = 0; i < 6; i++) await TEST_POST(asReq(testReq(h)));
    expect((await GET(asReq(get(h)))).status).toBe(200);
  });

  it('limits per client, not globally', async () => {
    setSetting(SETTING_KEYS.openaiKey, 'sk-test');
    for (let i = 0; i < 6; i++) await TEST_POST(asReq(testReq({ 'x-forwarded-for': '1.1.1.1' })));
    const other = await TEST_POST(asReq(testReq({ 'x-forwarded-for': '2.2.2.2' })));
    expect(other.status).toBe(200);
  });
});
