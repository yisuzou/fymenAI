import { NextRequest } from 'next/server';
import { checkAuth, checkRateLimit, clientKey } from '@/lib/api/guard';
import { getProvider } from '@/lib/llm';
import { readLlmConfig } from '@/lib/llm/config';

/**
 * Verify the saved configuration by actually talking to the provider.
 *
 * Uses the *saved* config rather than one posted in the body, so a caller
 * cannot use this as an open outbound-request tool with arbitrary targets. It
 * is still an outbound call to a configured URL — but anyone able to save that
 * URL can already point `/api/chat` at it, so this grants no new reach. That is
 * exactly why `APP_TOKEN` matters once the app is reachable from a network.
 *
 * Rate limited far tighter than the other routes (5/min, own bucket): unlike a
 * config read, each call spends real provider tokens.
 */

const TEST_LIMIT = 5;
const TIMEOUT_MS = 10_000;

type FailCode = 'no_key' | 'invalid_key' | 'model_not_found' | 'rate_limited' | 'network' | 'timeout' | 'unknown';

const MESSAGES: Record<FailCode, string> = {
  no_key: '还没有配置 API Key。',
  invalid_key: 'API Key 无效或已失效。',
  model_not_found: '模型不存在，或当前 Key 无权访问。',
  rate_limited: 'provider 端限流，请稍后再试。',
  network: '连不上 provider，请检查 Base URL 和网络。',
  timeout: `${TIMEOUT_MS / 1000} 秒内没有响应。`,
  unknown: '调用失败，详情见服务端日志。',
};

/** Map a provider error onto a stable code. The raw error never leaves the server. */
function classify(e: unknown): FailCode {
  const err = e as { status?: unknown; code?: unknown; message?: unknown };
  const status = typeof err?.status === 'number' ? err.status : null;
  if (status === 401 || status === 403) return 'invalid_key';
  if (status === 404) return 'model_not_found';
  if (status === 429) return 'rate_limited';

  const code = typeof err?.code === 'string' ? err.code : '';
  if (['ENOTFOUND', 'ECONNREFUSED', 'ECONNRESET', 'EAI_AGAIN', 'ETIMEDOUT'].includes(code)) {
    return 'network';
  }
  const message = typeof err?.message === 'string' ? err.message.toLowerCase() : '';
  if (message.includes('fetch failed') || message.includes('network')) return 'network';
  if (message.includes('model') && message.includes('not found')) return 'model_not_found';
  return 'unknown';
}

function fail(code: FailCode) {
  // 200 with ok:false — the request itself succeeded, the provider call did not.
  return Response.json({ ok: false, code, message: MESSAGES[code] });
}

export async function POST(req: NextRequest) {
  const denied =
    checkAuth(req) ?? checkRateLimit(`settings-test:${clientKey(req)}`, TEST_LIMIT);
  if (denied) return denied;

  const cfg = readLlmConfig();
  if (cfg.provider !== 'mock' && !cfg.apiKey) return fail('no_key');

  const started = Date.now();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);

  try {
    // Read one chunk and stop; breaking out closes the underlying request, so
    // this costs a couple of tokens rather than a whole answer. The signal is
    // what makes the timeout real rather than just giving up on waiting.
    const stream = getProvider(cfg).chatStream([{ role: 'user', content: 'ping' }], {
      signal: ac.signal,
    });
    for await (const _chunk of stream) {
      void _chunk;
      break;
    }
    return Response.json({
      ok: true,
      provider: cfg.provider,
      model: cfg.model,
      latencyMs: Date.now() - started,
    });
  } catch (e) {
    console.error('[api/settings/test] provider error:', e);
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    return fail(aborted || ac.signal.aborted ? 'timeout' : classify(e));
  } finally {
    clearTimeout(timer);
  }
}
