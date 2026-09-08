import { NextRequest } from 'next/server';
import { getProvider } from '@/lib/llm';
import type { LLMMessage } from '@/lib/llm/types';
import {
  SYSTEM_TEACHER,
  SYSTEM_BRANCH,
  SYSTEM_FEYNMAN_GRADER,
  branchContextMessage,
} from '@/lib/llm/prompts';
import {
  ChatRequestSchema,
  badRequest,
  checkAuth,
  checkRateLimit,
  clientKey,
  errorResponse,
} from '@/lib/api/guard';
import { NDJSON_HEADERS, createNdjsonStream } from '@/lib/api/stream';

export async function POST(req: NextRequest) {
  // Reject before doing any work, and before opening a stream, so these are
  // real status codes rather than an error buried in a 200 response body.
  const denied = checkAuth(req) ?? checkRateLimit(clientKey(req));
  if (denied) return denied;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return errorResponse(400, { code: 'invalid_json', message: '请求体不是合法 JSON。' });
  }

  const parsed = ChatRequestSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  const messages: LLMMessage[] = [];
  if (body.mode === 'grade') {
    messages.push({ role: 'system', content: SYSTEM_FEYNMAN_GRADER });
  } else if (body.mode === 'branch' && body.selectedText) {
    // Framed text travels as tagged data in a user turn, not as a system
    // instruction — see SYSTEM_BRANCH.
    messages.push({ role: 'system', content: SYSTEM_BRANCH });
    messages.push({
      role: 'user',
      content: branchContextMessage(body.selectedText, body.parentContext ?? ''),
    });
  } else {
    messages.push({ role: 'system', content: SYSTEM_TEACHER });
  }
  messages.push(...body.messages);

  const stream = createNdjsonStream(
    () => getProvider().chatStream(messages, { json: body.mode === 'grade' }),
    (e) => {
      // Raw provider errors can carry the base URL, model name and quota
      // details — log them, send the client a stable code instead.
      console.error('[api/chat] provider error:', e);
      return { code: 'provider_error', message: '模型调用失败，请稍后重试。' };
    },
  );

  return new Response(stream, { headers: NDJSON_HEADERS });
}
