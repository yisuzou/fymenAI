import { NextRequest } from 'next/server';
import { z } from 'zod';
import { deleteMessage, updateMessageContent } from '@/lib/db/queries';

const PatchSchema = z.object({ content: z.string() });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = PatchSchema.parse(await req.json());
  updateMessageContent(id, body.content);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  deleteMessage(id);
  return Response.json({ ok: true });
}
