import { describe, it, expect } from 'vitest';
import { buildQuestionTree, flattenTree } from '@/lib/tree';
import type { Message } from '@/lib/types';

const TOPIC = 't1';
let clock = 1000;

function msg(over: Partial<Message> & { id: string; role: Message['role'] }): Message {
  return {
    topicId: TOPIC,
    branchId: 'main',
    parentMessageId: null,
    content: '',
    branchFrom: null,
    createdAt: clock++,
    ...over,
  } as Message;
}

function tree(messages: Message[]) {
  const map: Record<string, Message> = {};
  for (const m of messages) map[m.id] = m;
  return buildQuestionTree(TOPIC, { [TOPIC]: map });
}

describe('buildQuestionTree', () => {
  it('returns nothing for an unknown topic', () => {
    expect(buildQuestionTree('nope', {})).toEqual([]);
  });

  it('numbers main questions Q1, Q2 … in ask order', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: '什么是熵' }),
      msg({ id: 'a1', role: 'assistant', content: '熵是…' }),
      msg({ id: 'u2', role: 'user', content: '什么是焓' }),
      msg({ id: 'a2', role: 'assistant', content: '焓是…' }),
    ]);
    expect(nodes.map((n) => [n.number, n.label])).toEqual([
      ['Q1', '什么是熵'],
      ['Q2', '什么是焓'],
    ]);
    // Each question owns its own turn pair, not the whole main thread.
    expect(nodes[0].messages.map((m) => m.id)).toEqual(['u1', 'a1']);
    expect(nodes[1].messages.map((m) => m.id)).toEqual(['u2', 'a2']);
  });

  it('nests branches and grandchildren with dotted numbers', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A 提到 X 和 Y' }),
      // branch under a1
      msg({
        id: 'b1',
        role: 'user',
        branchId: 'b1',
        branchFrom: { parentMessageId: 'a1', selectedText: 'X' },
      }),
      msg({ id: 'b1a', role: 'assistant', branchId: 'b1', content: 'X 是…' }),
      // grandchild under b1a
      msg({
        id: 'b2',
        role: 'user',
        branchId: 'b2',
        branchFrom: { parentMessageId: 'b1a', selectedText: 'Z' },
      }),
    ]);

    expect(nodes).toHaveLength(1);
    const [q1] = nodes;
    expect(q1.children.map((c) => [c.number, c.label])).toEqual([['Q1.1', 'X']]);
    expect(q1.children[0].children.map((c) => [c.number, c.label])).toEqual([['Q1.1.1', 'Z']]);
  });

  it('does not also attach a nested branch to the top-level question', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A' }),
      msg({
        id: 'b1',
        role: 'user',
        branchId: 'b1',
        branchFrom: { parentMessageId: 'a1', selectedText: 'X' },
      }),
      msg({ id: 'b1a', role: 'assistant', branchId: 'b1' }),
      msg({
        id: 'b2',
        role: 'user',
        branchId: 'b2',
        branchFrom: { parentMessageId: 'b1a', selectedText: 'Z' },
      }),
    ]);
    const flat = flattenTree(nodes);
    // b2 must appear exactly once, under b1 — not duplicated as a child of Q1.
    expect(flat.filter((n) => n.branchId === 'b2')).toHaveLength(1);
    expect(nodes[0].children.map((c) => c.branchId)).toEqual(['b1']);
  });

  it('orders siblings by their first message time at every depth', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A' }),
      msg({
        id: 'later',
        role: 'user',
        branchId: 'later',
        createdAt: 9000,
        branchFrom: { parentMessageId: 'a1', selectedText: '后问的' },
      }),
      msg({
        id: 'earlier',
        role: 'user',
        branchId: 'earlier',
        createdAt: 2000,
        branchFrom: { parentMessageId: 'a1', selectedText: '先问的' },
      }),
    ]);
    expect(nodes[0].children.map((c) => c.label)).toEqual(['先问的', '后问的']);
    expect(nodes[0].children.map((c) => c.number)).toEqual(['Q1.1', 'Q1.2']);
  });

  it('keys main questions by message id and branches by branch id', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A' }),
      msg({
        id: 'b1',
        role: 'user',
        branchId: 'b1',
        branchFrom: { parentMessageId: 'a1', selectedText: 'X' },
      }),
    ]);
    expect(nodes[0].key).toBe('q-u1');
    expect(nodes[0].children[0].key).toBe('b1');
  });

  /**
   * Regression: Feynman results used to be keyed by the node's *text*, so
   * framing the same phrase under two different answers made both nodes share
   * one result — grading one silently overwrote the other.
   */
  it('gives identical framed text under different parents distinct keys', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q1' }),
      msg({ id: 'a1', role: 'assistant', content: 'A1' }),
      msg({ id: 'u2', role: 'user', content: 'Q2' }),
      msg({ id: 'a2', role: 'assistant', content: 'A2' }),
      msg({
        id: 'bx',
        role: 'user',
        branchId: 'bx',
        branchFrom: { parentMessageId: 'a1', selectedText: '梯度下降' },
      }),
      msg({
        id: 'by',
        role: 'user',
        branchId: 'by',
        branchFrom: { parentMessageId: 'a2', selectedText: '梯度下降' },
      }),
    ]);
    const branches = flattenTree(nodes).filter((n) => n.kind === 'branch');
    expect(branches.map((b) => b.label)).toEqual(['梯度下降', '梯度下降']);
    expect(new Set(branches.map((b) => b.key)).size).toBe(2);
  });

  it('terminates on a cyclic branchFrom instead of hanging', () => {
    clock = 1000;
    // b1's first message is anchored inside b2 and b2's inside b1.
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({ id: 'a1', role: 'assistant', content: 'A' }),
      msg({
        id: 'b1',
        role: 'user',
        branchId: 'b1',
        branchFrom: { parentMessageId: 'a1', selectedText: 'X' },
      }),
      msg({
        id: 'b2',
        role: 'user',
        branchId: 'b2',
        branchFrom: { parentMessageId: 'b3', selectedText: 'Y' },
      }),
      msg({ id: 'b3', role: 'assistant', branchId: 'b2' }),
    ]);
    expect(flattenTree(nodes).length).toBeGreaterThan(0);
  });

  it('ignores branches whose parent message no longer exists', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q' }),
      msg({
        id: 'orphan',
        role: 'user',
        branchId: 'orphan',
        branchFrom: { parentMessageId: 'deleted', selectedText: 'X' },
      }),
    ]);
    expect(nodes[0].children).toEqual([]);
  });
});

describe('flattenTree', () => {
  it('walks pre-order: each question followed by its own branches', () => {
    clock = 1000;
    const nodes = tree([
      msg({ id: 'u1', role: 'user', content: 'Q1' }),
      msg({ id: 'a1', role: 'assistant', content: 'A1' }),
      msg({
        id: 'b1',
        role: 'user',
        branchId: 'b1',
        branchFrom: { parentMessageId: 'a1', selectedText: 'X' },
      }),
      msg({ id: 'u2', role: 'user', content: 'Q2' }),
    ]);
    expect(flattenTree(nodes).map((n) => n.number)).toEqual(['Q1', 'Q1.1', 'Q2']);
  });
});
