import { NextRequest } from 'next/server';
import { z } from 'zod';
import { deleteTopic, getTopic, listMessagesByTopic, updateTopicTitle } from '@/lib/db/queries';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const topic = getTopic(id);
  if (!topic) return new Response('not found', { status: 404 });
  const messages = listMessagesByTopic(id);
  return Response.json({ topic, messages });
}

const PatchSchema = z.object({ title: z.string().min(1).max(200) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = PatchSchema.parse(await req.json());
  updateTopicTitle(id, body.title);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteTopic(id);
  return Response.json({ ok: true });
}
