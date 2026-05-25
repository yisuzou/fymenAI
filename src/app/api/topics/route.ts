import { NextRequest } from 'next/server';
import { z } from 'zod';
import { createTopic, listTopics } from '@/lib/db/queries';

export async function GET() {
  return Response.json(listTopics());
}

const PostSchema = z.object({ title: z.string().min(1).max(200) });

export async function POST(req: NextRequest) {
  const body = PostSchema.parse(await req.json());
  return Response.json(createTopic({ title: body.title }));
}
