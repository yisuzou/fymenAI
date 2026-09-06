'use client';
import { useCallback, useEffect, useState } from 'react';
import { useUiStore } from '@/lib/store/uiStore';
import { apiFetch, getAppToken, setAppToken } from '@/lib/api/client';

type ProviderId = 'openai' | 'anthropic' | 'mock';
type Source = 'settings' | 'env' | 'default';
type Field = 'provider' | 'model' | 'baseUrl' | 'maxTokens' | 'apiKey';

interface ConfigView {
  provider: ProviderId;
  model: string;
  baseUrl: string | null;
  maxTokens: number;
  hasKey: boolean;
  keyHint: string | null;
  sources: Record<Field, Source>;
  appTokenRequired: boolean;
}

interface TestResult {
  ok: boolean;
  code?: string;
  message?: string;
  model?: string;
  latencyMs?: number;
}

const PROVIDERS: { id: ProviderId; label: string; hint: string }[] = [
  { id: 'openai', label: 'OpenAI 兼容', hint: '官方 OpenAI，或任何兼容网关（MiMo、DeepSeek…）' },
  { id: 'anthropic', label: 'Anthropic', hint: 'Claude 系列' },
  { id: 'mock', label: 'Mock', hint: '本地假回答，不发真实请求、不需要 Key' },
];

const MODEL_PLACEHOLDER: Record<ProviderId, string> = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-5-sonnet-latest',
  mock: 'mock',
};

const SOURCE_LABEL: Record<Source, string> = {
  settings: '来自设置',
  env: '来自环境变量',
  default: '默认值',
};

function SourceTag({ source }: { source: Source }) {
  const tone =
    source === 'settings'
      ? 'bg-blue-50 text-blue-600'
      : source === 'env'
        ? 'bg-amber-50 text-amber-700'
        : 'bg-gray-100 text-gray-500';
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${tone}`}>{SOURCE_LABEL[source]}</span>;
}

function Row({
  label,
  source,
  children,
  note,
}: {
  label: string;
  source?: Source;
  children: React.ReactNode;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        {source && <SourceTag source={source} />}
      </div>
      {children}
      {note && <p className="text-[11px] leading-snug text-gray-500">{note}</p>}
    </div>
  );
}

const INPUT =
  'w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-200 disabled:bg-gray-50 disabled:text-gray-400';

export function SettingsModal() {
  const setOpen = useUiStore((s) => s.setSettingsOpen);

  const [view, setView] = useState<ConfigView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [saved, setSaved] = useState(false);

  // Draft state. `apiKey` empty means "leave whatever is stored alone".
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [maxTokens, setMaxTokens] = useState('');
  const [apiKey, setApiKey] = useState('');
  // Lazy, not an effect: this component only mounts once the user clicks the
  // gear, which is always after hydration, so reading localStorage here cannot
  // produce a server/client mismatch.
  const [token, setToken] = useState(() => getAppToken() ?? '');
  // Bumped to re-run the load effect after the token changes.
  const [reloadKey, setReloadKey] = useState(0);

  const close = useCallback(() => setOpen(false), [setOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [close]);

  const adopt = useCallback((v: ConfigView) => {
    setView(v);
    setLoadError(null);
    setProvider(v.provider);
    // Only show a value in the box when it is an explicit override; otherwise
    // leave it empty so the placeholder shows what is actually in effect.
    setModel(v.sources.model === 'settings' ? v.model : '');
    setBaseUrl(v.sources.baseUrl === 'settings' ? (v.baseUrl ?? '') : '');
    setMaxTokens(v.sources.maxTokens === 'settings' ? String(v.maxTokens) : '');
    setApiKey('');
  }, []);

  // Load the current config on mount, and again whenever the access token
  // changes (a wrong token means the first load came back 401). setState lives
  // in the `.then` callbacks rather than in a function the effect body calls,
  // which is both what `react-hooks/set-state-in-effect` wants and clearer
  // about the fact that nothing here runs during render.
  useEffect(() => {
    let alive = true;
    apiFetch('/api/settings')
      .then(async (res) => {
        if (res.status === 401) return { unauthorized: true } as const;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return { view: (await res.json()) as ConfigView } as const;
      })
      .then((r) => {
        if (!alive) return;
        if ('unauthorized' in r) {
          setLoadError('访问令牌无效或缺失，请在下方填写后重试。');
          setView(null);
          return;
        }
        adopt(r.view);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setLoadError(e instanceof Error ? `读取配置失败：${e.message}` : '读取配置失败。');
      });
    return () => {
      alive = false;
    };
  }, [adopt, reloadKey]);

  async function save() {
    setSaving(true);
    setSaved(false);
    setTest(null);
    try {
      const body: Record<string, unknown> = { provider };
      if (view?.sources.model === 'settings' || model.trim() !== '') body.model = model.trim();
      if (view?.sources.baseUrl === 'settings' || baseUrl.trim() !== '') body.baseUrl = baseUrl.trim();
      if (maxTokens.trim() !== '') {
        const n = Number(maxTokens);
        if (!Number.isFinite(n) || n < 1) {
          setLoadError('Max tokens 必须是正整数。');
          setSaving(false);
          return;
        }
        body.maxTokens = Math.floor(n);
      }
      // Empty box = do not touch the stored key. Clearing is a separate button.
      if (apiKey.trim() !== '') body.apiKey = apiKey.trim();

      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new Error(j?.message ?? `HTTP ${res.status}`);
      }
      adopt((await res.json()) as ConfigView);
      setSaved(true);
    } catch (e) {
      setLoadError(e instanceof Error ? `保存失败：${e.message}` : '保存失败。');
    } finally {
      setSaving(false);
    }
  }

  async function clearKey() {
    setSaving(true);
    try {
      const res = await apiFetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: null }),
      });
      if (res.ok) adopt((await res.json()) as ConfigView);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    try {
      const res = await apiFetch('/api/settings/test', { method: 'POST' });
      if (res.status === 429) {
        setTest({ ok: false, message: '测试太频繁了（每分钟 5 次），稍等一下。' });
        return;
      }
      setTest((await res.json()) as TestResult);
    } catch (e) {
      setTest({ ok: false, message: e instanceof Error ? e.message : '测试失败。' });
    } finally {
      setTesting(false);
    }
  }

  function saveToken() {
    setAppToken(token.trim() === '' ? null : token.trim());
    setReloadKey((n) => n + 1);
  }

  const isMock = provider === 'mock';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="API 配置"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-gray-800">API 配置</h2>
          <button
            onClick={close}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="关闭"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {view && !view.appTokenRequired && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[11px] leading-snug text-amber-800">
              未设置 <code className="font-mono">APP_TOKEN</code>：任何能打开这个页面的人都可以修改配置、
              使用你的 API Key。仅在本机使用时没问题，暴露到网络前请设置它。
            </p>
          )}

          {loadError && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{loadError}</p>
          )}

          <Row label="Provider" source={view?.sources.provider}>
            <div className="flex gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={`flex-1 rounded-md border px-2 py-1.5 text-xs transition ${
                    provider === p.id
                      ? 'border-blue-400 bg-blue-50 font-medium text-blue-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              {PROVIDERS.find((p) => p.id === provider)?.hint}
            </p>
          </Row>

          <Row
            label="模型"
            source={view?.sources.model}
            note={`留空则使用${view ? `当前生效值 ${view.model}` : '默认值'}`}
          >
            <input
              className={INPUT}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_PLACEHOLDER[provider]}
              disabled={isMock}
              aria-label="模型"
            />
          </Row>

          {provider === 'openai' && (
            <Row label="Base URL" source={view?.sources.baseUrl} note="留空则使用官方 OpenAI 端点">
              <input
                className={INPUT}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                aria-label="Base URL"
              />
            </Row>
          )}

          {provider === 'anthropic' && (
            <Row label="Max tokens" source={view?.sources.maxTokens}>
              <input
                className={INPUT}
                value={maxTokens}
                onChange={(e) => setMaxTokens(e.target.value)}
                placeholder={String(view?.maxTokens ?? 2048)}
                inputMode="numeric"
                aria-label="Max tokens"
              />
            </Row>
          )}

          <Row
            label="API Key"
            source={view?.sources.apiKey}
            note={
              isMock
                ? 'Mock 模式不需要 Key。'
                : '留空表示不改动已保存的 Key。Key 存在服务端 SQLite，页面永远读不回明文。'
            }
          >
            <div className="flex gap-1.5">
              <input
                className={INPUT}
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={view?.hasKey ? `已保存 ${view.keyHint}` : '尚未配置'}
                disabled={isMock}
                autoComplete="off"
                aria-label="API Key"
              />
              {view?.hasKey && view.sources.apiKey === 'settings' && (
                <button
                  type="button"
                  onClick={clearKey}
                  disabled={saving}
                  className="flex-shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                >
                  清除
                </button>
              )}
            </div>
          </Row>

          {(view?.appTokenRequired || token !== '') && (
            <Row
              label="访问令牌"
              note="服务端设置了 APP_TOKEN，浏览器需要带上它。只存在本机浏览器，不会写入服务端。"
            >
              <div className="flex gap-1.5">
                <input
                  className={INPUT}
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="APP_TOKEN"
                  autoComplete="off"
                  aria-label="访问令牌"
                />
                <button
                  type="button"
                  onClick={saveToken}
                  className="flex-shrink-0 rounded-md border border-gray-300 px-2 text-xs text-gray-600 hover:bg-gray-50"
                >
                  应用
                </button>
              </div>
            </Row>
          )}

          {test && (
            <p
              className={`rounded-md px-3 py-2 text-xs ${
                test.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              }`}
            >
              {test.ok
                ? `连接正常 · ${test.model} · ${test.latencyMs}ms`
                : (test.message ?? '测试失败。')}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t bg-gray-50 px-4 py-3">
          <span className="text-[11px] text-gray-500">
            {saved ? '已保存，立即生效，无需重启' : '保存后再测试连接'}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={runTest}
              disabled={testing || saving || !view}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              {testing ? '测试中…' : '测试连接'}
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving || !view}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中…' : '保存'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
