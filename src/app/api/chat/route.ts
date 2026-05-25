import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/llm';
import { SYSTEM_TEACHER, SYSTEM_SUBTHREAD } from '@/lib/llm/prompts';

const Schema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string() })),
  mode: z.enum(['teach', 'subthread', 'grade']).optional(),
  triggerWord: z.string().optional(),
  parentContext: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const body = Schema.parse(await req.json());
  const sys =
    body.mode === 'subthread' && body.triggerWord
      ? SYSTEM_SUBTHREAD(body.triggerWord, body.parentContext ?? '')
      : SYSTEM_TEACHER;
  const messages = [{ role: 'system' as const, content: sys }, ...body.messages];

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of getProvider().chatStream(messages)) {
          controller.enqueue(encoder.encode(chunk));
        }
      } catch (e: any) {
        controller.enqueue(encoder.encode(`\n[ERROR]${e.message}`));
      } finally { controller.close(); }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  });
}
