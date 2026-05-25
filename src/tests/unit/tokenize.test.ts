import { it, expect } from 'vitest';
import { tokenizeForClicking } from '@/lib/utils/tokenize';

it('splits english and CJK', () => {
  const tokens = tokenizeForClicking('Hello 闭包 world');
  expect(tokens.map(t => t.text)).toEqual(['Hello', ' ', '闭包', ' ', 'world']);
  expect(tokens.filter(t => t.clickable).map(t => t.text)).toEqual(['Hello', '闭包', 'world']);
});
