/**
 * Newline-delimited JSON event protocol for the chat stream.
 *
 * Replaces the previous plain-text stream, where a provider failure was
 * appended to the body as `\n[ERROR]<raw message>` — with HTTP 200. That had
 * three problems: the client could not tell content from failure, the error
 * text got persisted as the assistant's reply, and the raw provider message
 * (base URL, model name, quota details) leaked to the browser.
 *
 * Now: request-level failures are real status codes with a JSON body, and
 * mid-stream failures are an `error` event the client can act on without
 * polluting the message.
 */

export type StreamEvent =
  | { t: 'delta'; v: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'done' };

export const NDJSON_HEADERS: Record<string, string> = {
  'Content-Type': 'application/x-ndjson; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  // Ask reverse proxies not to buffer, so tokens arrive as they are produced.
  'X-Accel-Buffering': 'no',
};

export function eventLine(e: StreamEvent): string {
  return JSON.stringify(e) + '\n';
}

/** Thrown by `streamEvents` when the request itself is rejected (non-2xx). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

function parseEvent(line: string): StreamEvent | null {
  try {
    const o: unknown = JSON.parse(line);
    if (!o || typeof o !== 'object') return null;
    const e = o as Record<string, unknown>;
    if (e.t === 'delta' && typeof e.v === 'string') return { t: 'delta', v: e.v };
    if (e.t === 'error') {
      return {
        t: 'error',
        code: typeof e.code === 'string' ? e.code : 'unknown',
        message: typeof e.message === 'string' ? e.message : '生成失败。',
      };
    }
    if (e.t === 'done') return { t: 'done' };
    return null;
  } catch {
    return null;
  }
}

/**
 * POST `body` to `url` and yield decoded events.
 *
 * Buffers across chunk boundaries: a single JSON object can be split by the
 * transport, so only complete lines are parsed. Unparseable lines are skipped
 * rather than aborting the stream.
 */
export async function* streamEvents(
  url: string,
  body: unknown,
  init?: { signal?: AbortSignal; headers?: Record<string, string> },
): AsyncIterable<StreamEvent> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    body: JSON.stringify(body),
    signal: init?.signal,
  });

  if (!res.ok) {
    let code = 'http_error';
    let message = `请求失败（${res.status}）。`;
    try {
      const j = (await res.json()) as { code?: unknown; message?: unknown };
      if (typeof j.code === 'string') code = j.code;
      if (typeof j.message === 'string') message = j.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new ApiRequestError(res.status, code, message);
  }
  if (!res.body) throw new ApiRequestError(500, 'no_body', '响应没有内容。');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      for (;;) {
        const nl = buf.indexOf('\n');
        if (nl === -1) break;
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        const ev = parseEvent(line);
        if (ev) yield ev;
      }
    }
    // Flush a trailing line that arrived without a newline.
    const tail = (buf + decoder.decode()).trim();
    if (tail) {
      const ev = parseEvent(tail);
      if (ev) yield ev;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Wrap a chunk generator into an NDJSON byte stream.
 *
 * `mapError` decides what the client is told; the raw error stays server-side.
 */
export function createNdjsonStream(
  chunks: () => AsyncIterable<string>,
  mapError: (e: unknown) => { code: string; message: string },
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const v of chunks()) {
          if (v) controller.enqueue(encoder.encode(eventLine({ t: 'delta', v })));
        }
        controller.enqueue(encoder.encode(eventLine({ t: 'done' })));
      } catch (e) {
        const { code, message } = mapError(e);
        controller.enqueue(encoder.encode(eventLine({ t: 'error', code, message })));
      } finally {
        controller.close();
      }
    },
  });
}
