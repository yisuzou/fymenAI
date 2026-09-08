export interface GradeResult {
  correct: string[];
  missing: string[];
  wrong: string[];
  /** 0–100, always. */
  score: number;
  advice: string;
}

/**
 * Yield every balanced top-level `{…}` region, skipping braces that appear
 * inside string literals (and honouring backslash escapes).
 *
 * The previous implementation was `text.match(/\{[\s\S]*\}/)` — greedy from the
 * first `{` to the last `}`. Any prose containing a brace before or after the
 * real payload ("下面是 JSON: {…} 希望有帮助 {加油}") produced one unparseable
 * blob and the grade was thrown away after the user had already waited for it.
 */
function* jsonObjects(text: string): Generator<string> {
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
      continue;
    }
    if (ch === '}' && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        yield text.slice(start, i + 1);
        start = -1;
      }
    }
  }
}

function toStringArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  if (typeof v === 'string' && v) return [v];
  return [];
}

/** Accept a number or a numeric string, then clamp into range. */
function toScore(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.trim()) : NaN;
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Extract a grade from raw model output.
 *
 * Tolerates ```json fences, prose on either side, and a score sent as a string;
 * returns null only when no balanced object with a usable score is present.
 */
export function parseGrade(text: string): GradeResult | null {
  if (!text) return null;
  for (const candidate of jsonObjects(text)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      continue;
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
    const o = parsed as Record<string, unknown>;
    const score = toScore(o.score);
    if (score === null) continue;
    return {
      correct: toStringArray(o.correct),
      missing: toStringArray(o.missing),
      wrong: toStringArray(o.wrong),
      score,
      advice: typeof o.advice === 'string' ? o.advice : '',
    };
  }
  return null;
}
