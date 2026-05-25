import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getProvider } from '@/lib/llm';

const Schema = z.object({ topic: z.string().min(1) });

export async function POST(req: NextRequest) {
  const { topic } = Schema.parse(await req.json());
  const sys = `请为主题"${topic}"生成结构化学习大纲，输出严格 JSON：
  {"topic":"...","modules":[{"title":"...","items":["..."]}]}。不要 Markdown 代码块，只要 JSON。`;
  let text = '';
  for await (const c of getProvider().chatStream([
    { role: 'system', content: sys },
    { role: 'user', content: topic },
  ])) text += c;
  const json = text.replace(/```json|```/g, '').trim();
  try { return Response.json(JSON.parse(json)); }
  catch { return Response.json({ topic, modules: [], raw: text }, { status: 200 }); }
}
