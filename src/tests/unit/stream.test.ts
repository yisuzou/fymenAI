// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  streamEvents,
  createNdjsonStream,
  eventLine,
  ApiRequestError,
  NDJSON_HEADERS,
  type StreamEvent,
} from '@/lib/api/stream';

/** A Response whose body emits exactly the given chunks, in order. */
function streamingResponse(chunks: (string | Uint8Array)[], status = 200): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const c of chunks) {
        controller.enqueue(typeof c === 'string' ? encoder.encode(c) : c);
      }
      controller.close();
    },
  });
  return new Response(body, { status, headers: NDJSON_HEADERS });
}

function mockFetch(res: Response | (() => Response | Promise<Response>)) {
  const fn = vi.fn(async () => (typeof res === 'function' ? res() : res));
  vi.stubGlobal('fetch', fn);
  return fn;
}

async function collect(chunks: (string | Uint8Array)[]): Promise<StreamEvent[]> {
  mockFetch(() => streamingResponse(chunks));
  const out: StreamEvent[] = [];
  for await (const ev of streamEvents('/api/chat', { a: 1 })) out.push(ev);
  return out;
}

afterEach(() => vi.unstubAllGlobals());

describe('streamEvents', () => {
  it('yields delta events in order and stops at done', async () => {
    const events = await collect([
      eventLine({ t: 'delta', v: 'Hello' }),
      eventLine({ t: 'delta', v: ' world' }),
      eventLine({ t: 'done' }),
    ]);
    expect(events).toEqual([
      { t: 'delta', v: 'Hello' },
      { t: 'delta', v: ' world' },
      { t: 'done' },
    ]);
  });

  it('buffers a JSON object split across chunk boundaries', async () => {
    const line = eventLine({ t: 'delta', v: '梯度下降' });
    const cut = Math.floor(line.length / 2);
    const events = await collect([line.slice(0, cut), line.slice(cut), eventLine({ t: 'done' })]);
    expect(events).toEqual([{ t: 'delta', v: '梯度下降' }, { t: 'done' }]);
  });

  it('buffers a multi-byte character split across chunk boundaries', async () => {
    const bytes = new TextEncoder().encode(eventLine({ t: 'delta', v: '梯度' }));
    // Cut inside '梯' (3 bytes in UTF-8): one byte past where it starts.
    const cut = bytes.findIndex((b) => b >= 0x80) + 1;
    expect(cut).toBeGreaterThan(0);
    const events = await collect([bytes.slice(0, cut), bytes.slice(cut)]);
    expect(events).toEqual([{ t: 'delta', v: '梯度' }]);
  });

  it('delivers several events arriving in one chunk', async () => {
    const events = await collect([
      eventLine({ t: 'delta', v: 'a' }) + eventLine({ t: 'delta', v: 'b' }) + eventLine({ t: 'done' }),
    ]);
    expect(events.map((e) => (e.t === 'delta' ? e.v : e.t))).toEqual(['a', 'b', 'done']);
  });

  it('flushes a trailing line that never got its newline', async () => {
    const events = await collect([JSON.stringify({ t: 'delta', v: 'tail' })]);
    expect(events).toEqual([{ t: 'delta', v: 'tail' }]);
  });

  it('skips unparseable and blank lines instead of aborting', async () => {
    const events = await collect([
      'not json\n',
      '\n',
      '{"t":"delta"}\n', // missing v
      '{"t":"weird"}\n',
      eventLine({ t: 'delta', v: 'ok' }),
      eventLine({ t: 'done' }),
    ]);
    expect(events).toEqual([{ t: 'delta', v: 'ok' }, { t: 'done' }]);
  });

  it('surfaces an error frame as an event, keeping it out of the content', async () => {
    const events = await collect([
      eventLine({ t: 'delta', v: '部分回答' }),
      eventLine({ t: 'error', code: 'provider_error', message: '生成失败。' }),
    ]);
    expect(events).toEqual([
      { t: 'delta', v: '部分回答' },
      { t: 'error', code: 'provider_error', message: '生成失败。' },
    ]);
  });

  it('fills in defaults for an error frame missing code/message', async () => {
    const events = await collect(['{"t":"error"}\n']);
    expect(events).toEqual([{ t: 'error', code: 'unknown', message: '生成失败。' }]);
  });

  it('throws ApiRequestError with the server code and message on non-2xx', async () => {
    mockFetch(
      () =>
        new Response(JSON.stringify({ code: 'rate_limited', message: '请求过于频繁。' }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    const iterate = async () => {
      for await (const _ of streamEvents('/api/chat', {})) void _;
    };
    await expect(iterate()).rejects.toMatchObject({
      name: 'ApiRequestError',
      status: 429,
      code: 'rate_limited',
      message: '请求过于频繁。',
    });
  });

  it('falls back to a generic message when the error body is not JSON', async () => {
    mockFetch(() => new Response('gateway exploded', { status: 502 }));
    const iterate = async () => {
      for await (const _ of streamEvents('/api/chat', {})) void _;
    };
    await expect(iterate()).rejects.toBeInstanceOf(ApiRequestError);
    await expect(iterate()).rejects.toMatchObject({
      status: 502,
      code: 'http_error',
      message: '请求失败（502）。',
    });
  });

  it('POSTs JSON and forwards extra headers and the abort signal', async () => {
    const fn = mockFetch(() => streamingResponse([eventLine({ t: 'done' })]));
    const controller = new AbortController();
    for await (const _ of streamEvents(
      '/api/chat',
      { topicId: 't1' },
      { headers: { Authorization: 'Bearer x' }, signal: controller.signal },
    )) {
      void _;
    }
    const [url, init] = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/chat');
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ topicId: 't1' }));
    expect(init.headers).toMatchObject({
      'Content-Type': 'application/json',
      Authorization: 'Bearer x',
    });
    expect(init.signal).toBe(controller.signal);
  });
});

async function readAll(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let out = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out + decoder.decode();
}

const lines = (s: string) => s.trim().split('\n').map((l) => JSON.parse(l) as StreamEvent);

describe('createNdjsonStream', () => {
  it('wraps chunks as delta frames and terminates with done', async () => {
    async function* chunks() {
      yield 'a';
      yield 'b';
    }
    const text = await readAll(createNdjsonStream(chunks, () => ({ code: 'x', message: 'x' })));
    expect(lines(text)).toEqual([
      { t: 'delta', v: 'a' },
      { t: 'delta', v: 'b' },
      { t: 'done' },
    ]);
  });

  it('drops empty chunks', async () => {
    async function* chunks() {
      yield '';
      yield 'a';
      yield '';
    }
    const text = await readAll(createNdjsonStream(chunks, () => ({ code: 'x', message: 'x' })));
    expect(lines(text)).toEqual([{ t: 'delta', v: 'a' }, { t: 'done' }]);
  });

  it('emits done for an empty generator', async () => {
    async function* chunks() {}
    const text = await readAll(createNdjsonStream(chunks, () => ({ code: 'x', message: 'x' })));
    expect(lines(text)).toEqual([{ t: 'done' }]);
  });

  it('maps a mid-stream throw to an error frame and never leaks the raw error', async () => {
    async function* chunks() {
      yield '已经写了一半';
      throw new Error('OPENAI_API_KEY sk-secret invalid at https://internal.example');
    }
    const text = await readAll(
      createNdjsonStream(chunks, () => ({ code: 'provider_error', message: '生成失败，请重试。' })),
    );
    expect(lines(text)).toEqual([
      { t: 'delta', v: '已经写了一半' },
      { t: 'error', code: 'provider_error', message: '生成失败，请重试。' },
    ]);
    expect(text).not.toContain('sk-secret');
    expect(text).not.toContain('internal.example');
  });

  it('emits an error frame instead of done when the very first chunk throws', async () => {
    async function* chunks(): AsyncGenerator<string> {
      throw new Error('boom');
    }
    const text = await readAll(
      createNdjsonStream(chunks, () => ({ code: 'provider_error', message: '失败。' })),
    );
    expect(lines(text)).toEqual([{ t: 'error', code: 'provider_error', message: '失败。' }]);
  });

  it('round-trips through streamEvents', async () => {
    async function* chunks() {
      yield '你好';
      yield '，世界';
    }
    const stream = createNdjsonStream(chunks, () => ({ code: 'x', message: 'x' }));
    mockFetch(() => new Response(stream, { status: 200, headers: NDJSON_HEADERS }));
    const out: StreamEvent[] = [];
    for await (const ev of streamEvents('/api/chat', {})) out.push(ev);
    expect(out).toEqual([
      { t: 'delta', v: '你好' },
      { t: 'delta', v: '，世界' },
      { t: 'done' },
    ]);
  });
});

describe('eventLine', () => {
  it('produces one newline-terminated JSON object', () => {
    const line = eventLine({ t: 'delta', v: 'a\nb' });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.split('\n').filter(Boolean)).toHaveLength(1);
    expect(JSON.parse(line)).toEqual({ t: 'delta', v: 'a\nb' });
  });
});
