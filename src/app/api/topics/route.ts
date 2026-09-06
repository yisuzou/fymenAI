import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createTopic, listTopics } from '@/lib/db/queries';
import { parseBody } from '@/lib/api/guard';

export async function GET() {
  return Response.json(listTopics());
}

const PostSchema = z.object({ title: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, PostSchema);
  if (!parsed.ok) return parsed.response;
  return Response.json(createTopic({ title: parsed.data.title }));
}
