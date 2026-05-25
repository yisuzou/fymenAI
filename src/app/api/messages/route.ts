import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createMessage, setTopicRoot, getTopic } from '@/lib/db/queries';

const PostSchema = z.object({
  id: z.string().optional(),
  topicId: z.string(),
  branchId: z.string(),
  parentMessageId: z.string().nullable(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string(),
  branchFrom: z
    .object({ parentMessageId: z.string(), selectedText: z.string() })
    .nullable()
    .optional(),
  createdAt: z.number().optional(),
  setAsRoot: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const body = PostSchema.parse(await req.json());
  const topic = getTopic(body.topicId);
  if (!topic) return new Response('topic not found', { status: 404 });
  const msg = createMessage({
    id: body.id,
    topicId: body.topicId,
    branchId: body.branchId,
    parentMessageId: body.parentMessageId,
    role: body.role,
    content: body.content,
    branchFrom: body.branchFrom ?? null,
    createdAt: body.createdAt,
  });
  if (body.setAsRoot) setTopicRoot(body.topicId, msg.id);
  return Response.json(msg);
}
