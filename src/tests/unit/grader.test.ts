import { describe, it, expect } from 'vitest';
import { parseGrade } from '@/lib/utils/grader';

const FULL = {
  correct: ['抓住了核心'],
  missing: ['没提到边界条件'],
  wrong: ['把因果说反了'],
  score: 72,
  advice: '再讲一遍时先说结论。',
};

describe('parseGrade', () => {
  it('parses a bare JSON object', () => {
    expect(parseGrade(JSON.stringify(FULL))).toEqual(FULL);
  });

  it('parses JSON wrapped in a ```json fence', () => {
    const raw = '好的，评估如下：\n```json\n' + JSON.stringify(FULL) + '\n```\n希望有帮助！';
    expect(parseGrade(raw)).toEqual(FULL);
  });

  it('skips a leading non-grade object and finds the real one', () => {
    // The greedy `\{[\s\S]*\}` match used to span both braces and fail to parse.
    const raw = '{"thinking":"先看看"} 然后：' + JSON.stringify(FULL);
    expect(parseGrade(raw)?.score).toBe(72);
  });

  it('is not confused by braces inside string values', () => {
    const raw = JSON.stringify({ ...FULL, advice: '注意 {n} 与 {m} 的区别' });
    expect(parseGrade(raw)?.advice).toBe('注意 {n} 与 {m} 的区别');
  });

  it('is not confused by an escaped quote inside a string value', () => {
    const raw = JSON.stringify({ ...FULL, advice: '他说“}”其实无所谓 \\" 收尾' });
    expect(parseGrade(raw)?.score).toBe(72);
  });

  it('survives trailing prose containing a brace', () => {
    const raw = JSON.stringify(FULL) + '\n如需继续，请回复 {继续}';
    expect(parseGrade(raw)?.score).toBe(72);
  });

  it('accepts a score sent as a string', () => {
    expect(parseGrade(JSON.stringify({ ...FULL, score: '85' }))?.score).toBe(85);
  });

  it('clamps and rounds an out-of-range score', () => {
    expect(parseGrade(JSON.stringify({ ...FULL, score: 140 }))?.score).toBe(100);
    expect(parseGrade(JSON.stringify({ ...FULL, score: -20 }))?.score).toBe(0);
    expect(parseGrade(JSON.stringify({ ...FULL, score: 71.6 }))?.score).toBe(72);
  });

  it('defaults missing list fields to empty arrays', () => {
    const r = parseGrade(JSON.stringify({ score: 50 }));
    expect(r).toEqual({ correct: [], missing: [], wrong: [], score: 50, advice: '' });
  });

  it('accepts a single string where a list was expected', () => {
    expect(parseGrade(JSON.stringify({ score: 50, correct: '只有一条' }))?.correct).toEqual([
      '只有一条',
    ]);
  });

  it('drops non-string entries from lists', () => {
    expect(
      parseGrade(JSON.stringify({ score: 50, missing: ['ok', 3, null, '', 'fine'] }))?.missing,
    ).toEqual(['ok', 'fine']);
  });

  it('returns null when there is no JSON at all', () => {
    expect(parseGrade('抱歉，我无法评估。')).toBeNull();
    expect(parseGrade('')).toBeNull();
  });

  it('returns null when no object carries a usable score', () => {
    expect(parseGrade('{"advice":"很好"}')).toBeNull();
    expect(parseGrade('{"score":"很高"}')).toBeNull();
  });

  it('returns null on an unterminated object', () => {
    expect(parseGrade('{"score": 80, "advice": "被截断了')).toBeNull();
  });

  it('finds a grade object nested inside an array', () => {
    expect(parseGrade('[{"score": 80}]')?.score).toBe(80);
  });
});
