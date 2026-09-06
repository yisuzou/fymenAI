import { NextRequest } from 'next/server';
import { z } from 'zod';
import { deleteMessageCascade, updateMessageContent } from '@/lib/db/queries';
import { MAX_STORED_CONTENT_CHARS, parseBody } from '@/lib/api/guard';

const PatchSchema = z.object({ content: z.string().max(MAX_STORED_CONTENT_CHARS) });

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = await parseBody(req, PatchSchema);
  if (!parsed.ok) return parsed.response;
  updateMessageContent(id, parsed.data.content);
  return Response.json({ ok: true });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // Cascades to the rest of the branch and to every follow-up branch beneath it.
  const deleted = deleteMessageCascade(id);
  return Response.json({ ok: true, deleted });
}
