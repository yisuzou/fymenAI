export interface GradeResult {
  correct: string[];
  missing: string[];
  wrong: string[];
  score: number;
  advice: string;
}

export function parseGrade(text: string): GradeResult | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    if (typeof parsed.score !== 'number') return null;
    return {
      correct: Array.isArray(parsed.correct) ? parsed.correct : [],
      missing: Array.isArray(parsed.missing) ? parsed.missing : [],
      wrong: Array.isArray(parsed.wrong) ? parsed.wrong : [],
      score: parsed.score,
      advice: typeof parsed.advice === 'string' ? parsed.advice : '',
    };
  } catch {
    return null;
  }
}
