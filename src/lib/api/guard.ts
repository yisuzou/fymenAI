import { z } from 'zod';

/**
 * Payload caps for `/api/chat`. Without these, `messages: z.array(z.object({
 * content: z.string() }))` accepted unbounded input — any request could burn
 * arbitrary provider tokens.
 */
export const MAX_MESSAGE_CHARS = 8_000;
export const MAX_MESSAGES = 64;
export const MAX_TOTAL_CHARS = 60_000;

/** Requests per window, per client, for `/api/chat`. */
export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60_000;

/**
 * Cap for a single persisted message. Much looser than `MAX_MESSAGE_CHARS`
 * because a full assistant answer is stored verbatim, but still bounded so a
 * bad client cannot write an arbitrarily large row.
 */
export const MAX_STORED_CONTENT_CHARS = 200_000;

export const ChatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(MAX_MESSAGE_CHARS),
});

export const ChatRequestSchema = z
  .object({
    messages: z.array(ChatMessageSchema).min(1).max(MAX_MESSAGES),
    mode: z.enum(['teach', 'branch', 'grade']).optional(),
    selectedText: z.string().max(MAX_MESSAGE_CHARS).optional(),
    parentContext: z.string().max(MAX_MESSAGE_CHARS).optional(),
  })
  .refine(
    (b) => b.messages.reduce((n, m) => n + m.content.length, 0) <= MAX_TOTAL_CHARS,
    { message: `total content exceeds ${MAX_TOTAL_CHARS} characters` },
  );

export type ChatRequest = z.infer<typeof ChatRequestSchema>;

/** JSON error body shared by every route, so clients can branch on `code`. */
export interface ApiError {
  code: string;
  message: string;
  /** Field-level detail for validation failures. */
  issues?: { path: string; message: string }[];
}

export function errorResponse(status: number, body: ApiError, headers?: HeadersInit): Response {
  return Response.json(body, { status, headers });
}

export function badRequest(err: z.ZodError): Response {
  return errorResponse(400, {
    code: 'invalid_request',
    message: '请求格式不正确。',
    issues: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

export function notFound(message: string): Response {
  return errorResponse(404, { code: 'not_found', message });
}

/**
 * Read and validate a JSON body, returning a ready-made 400 instead of throwing.
 *
 * `schema.parse(await req.json())` was the old pattern everywhere: a malformed
 * body or a bad field both escaped as an unhandled rejection, which Next turns
 * into an opaque 500 with a stack trace in the log. Callers now get a typed
 * result and the client gets a `code` it can branch on.
 */
export async function parseBody<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.infer<T> } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: errorResponse(400, { code: 'invalid_json', message: '请求体不是合法 JSON。' }),
    };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, response: badRequest(parsed.error) };
  return { ok: true, data: parsed.data };
}

/**
 * Optional shared-secret gate. Inactive unless `APP_TOKEN` is set, so local use
 * needs no configuration; setting it in the environment is enough to close the
 * endpoint when self-hosting somewhere reachable.
 *
 * This is a door latch for a single-user deployment, not an account system.
 */
export function checkAuth(req: Request): Response | null {
  const expected = process.env.APP_TOKEN;
  if (!expected) return null;
  const got = req.headers.get('authorization');
  if (got === `Bearer ${expected}`) return null;
  return errorResponse(401, { code: 'unauthorized', message: '缺少或无效的访问令牌。' });
}

/**
 * Fixed-window rate limiter, per client key, in process memory.
 *
 * In-memory means it resets on restart and is per-instance — fine for the
 * single-process self-hosted deployment this app targets, and enough to stop a
 * runaway loop or a stray script from draining an API key. A multi-instance
 * deployment would need a shared store.
 */
const hits = new Map<string, { count: number; resetAt: number }>();

export function clientKey(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? 'local';
}

export function checkRateLimit(
  key: string,
  limit = RATE_LIMIT,
  windowMs = RATE_WINDOW_MS,
  now = Date.now(),
): Response | null {
  const entry = hits.get(key);
  if (!entry || now >= entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + windowMs });
    pruneExpired(now);
    return null;
  }
  entry.count += 1;
  if (entry.count <= limit) return null;
  const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
  return errorResponse(
    429,
    { code: 'rate_limited', message: '请求过于频繁，请稍后再试。' },
    { 'Retry-After': String(retryAfter) },
  );
}

/** Keep the map from growing without bound across many distinct clients. */
function pruneExpired(now: number) {
  if (hits.size < 1000) return;
  for (const [k, v] of hits) if (now >= v.resetAt) hits.delete(k);
}

/** Test-only: drop all rate-limit state. */
export function resetRateLimit() {
  hits.clear();
}
