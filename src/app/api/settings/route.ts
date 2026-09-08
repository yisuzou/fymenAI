import { NextRequest } from 'next/server';
import { z } from 'zod';
import { setSetting, deleteSetting } from '@/lib/db/queries';
import { checkAuth, checkRateLimit, clientKey, parseBody } from '@/lib/api/guard';
import { SETTING_KEYS, readLlmConfig, readLlmConfigView } from '@/lib/llm/config';

/**
 * Read and write runtime LLM configuration.
 *
 * Both verbs sit behind `checkAuth`: a writer can repoint `baseUrl` at another
 * server, so this endpoint must be no more open than `/api/chat`. GET never
 * returns the API key — only whether one is stored and its last four
 * characters (see `readLlmConfigView`).
 *
 * The rate-limit key is namespaced (`settings:`) so opening this dialog does not
 * eat into the `/api/chat` budget for the same client.
 */

export async function GET(req: NextRequest) {
  const denied = checkAuth(req) ?? checkRateLimit(`settings:${clientKey(req)}`);
  if (denied) return denied;
  return Response.json(readLlmConfigView());
}

const httpUrlOrEmpty = (v: string) => {
  if (v.trim() === '') return true;
  try {
    const u = new URL(v);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Every field is optional, and the three ways of not sending a real value mean
 * different things:
 *
 *   absent  → leave unchanged
 *   ''      → drop the override, fall back to env/default
 *   null    → (apiKey only) delete the stored key
 */
const PutSchema = z.object({
  provider: z.enum(['openai', 'anthropic', 'mock']).optional(),
  model: z.string().max(200).optional(),
  baseUrl: z.string().max(500).refine(httpUrlOrEmpty, { message: '必须是 http/https URL' }).optional(),
  maxTokens: z.number().int().min(1).max(200_000).optional(),
  apiKey: z.string().max(500).nullable().optional(),
});

export async function PUT(req: NextRequest) {
  const denied = checkAuth(req) ?? checkRateLimit(`settings:${clientKey(req)}`);
  if (denied) return denied;

  const parsed = await parseBody(req, PutSchema);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (body.provider !== undefined) setSetting(SETTING_KEYS.provider, body.provider);
  if (body.model !== undefined) setSetting(SETTING_KEYS.model, body.model.trim());
  if (body.baseUrl !== undefined) setSetting(SETTING_KEYS.baseUrl, body.baseUrl.trim());
  if (body.maxTokens !== undefined) setSetting(SETTING_KEYS.maxTokens, String(body.maxTokens));

  if (body.apiKey !== undefined) {
    // The key belongs to whichever provider is in effect after this update.
    const provider = body.provider ?? readLlmConfig().provider;
    const field = provider === 'anthropic' ? SETTING_KEYS.anthropicKey : SETTING_KEYS.openaiKey;
    if (body.apiKey === null || body.apiKey.trim() === '') deleteSetting(field);
    else setSetting(field, body.apiKey.trim());
  }

  // Return the updated view so the client does not need a second round trip.
  return Response.json(readLlmConfigView());
}
