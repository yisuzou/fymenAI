import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createMessage, setTopicRoot, getTopic } from '@/lib/db/queries';
import { MAX_STORED_CONTENT_CHARS, notFound, parseBody } from '@/lib/api/guard';

const PostSchema = z.object({
  id: z.string().min(1).max(64).optional(),
  topicId: z.string().min(1).max(64),
  branchId: z.string().min(1).max(64),
  parentMessageId: z.string().min(1).max(64).nullable(),
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(MAX_STORED_CONTENT_CHARS),
  branchFrom: z
    .object({
      parentMessageId: z.string().min(1).max(64),
      selectedText: z.string().max(MAX_STORED_CONTENT_CHARS),
    })
    .nullable()
    .optional(),
  createdAt: z.number().int().nonnegative().optional(),
  setAsRoot: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, PostSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;
  if (!getTopic(body.topicId)) return notFound('主题不存在。');
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
