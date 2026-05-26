import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/llm';
import { SYSTEM_TEACHER, SYSTEM_BRANCH, SYSTEM_FEYNMAN_GRADER } from '@/lib/llm/prompts';

const Schema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() })),
  mode: z.enum(['teach', 'branch', 'grade']).optional(),
  selectedText: z.string().optional(),
  parentContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = Schema.parse(await req.json());
  const sys =
    body.mode === 'grade'
      ? SYSTEM_FEYNMAN_GRADER
      : body.mode === 'branch' && body.selectedText
        ? SYSTEM_BRANCH(body.selectedText, body.parentContext ?? '')
        : SYSTEM_TEACHER;
  const messages = [{ role: 'system' as const, content: sys }, ...body.messages];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of getProvider().chatStream(messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        controller.enqueue(encoder.encode(`\n[ERROR]${msg}`));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
