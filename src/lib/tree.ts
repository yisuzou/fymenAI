import type { Message } from '@/lib/types';

/**
 * A node in the question tree: either a main-thread question or a follow-up
 * branch created by framing text in an answer.
 */
export interface QuestionNode {
  /**
   * Stable identity — `branchId` for a branch, `q-<messageId>` for a
   * main-thread question. Use this (never `label`) to key anything that must
   * survive edits elsewhere in the tree, such as Feynman check results: two
   * branches can legitimately frame the exact same phrase under different
   * parents, and text keys make them collide.
   */
  key: string;
  kind: 'main' | 'branch';
  /** The branch this node lives in. Main-thread questions report `'main'`. */
  branchId: string;
  /** First message of this node — the scroll target when it is clicked. */
  firstMessageId: string | null;
  /** Outline number: `Q1`, `Q1.1`, `Q1.1.1` … */
  number: string;
  /**
   * Full label text: the user's question for a main node, the framed text for
   * a branch. Never truncated — that is the renderer's decision.
   */
  label: string;
  /** Messages belonging to this node, ascending by `createdAt`. */
  messages: Message[];
  children: QuestionNode[];
}

type MessageMap = Record<string, Message>;

/**
 * Build the question tree for a topic.
 *
 * This is the single source of truth for tree shape *and* numbering. It used to
 * be copy-pasted into Tracer, Mindmap and FeynmanModal, which each numbered
 * nodes independently — so the same branch could show a different number
 * depending on which panel you looked at.
 *
 * Two invariants the shape depends on:
 *  - A nested branch (parent message lives in another *branch*) appears only in
 *    its parent's `children`, never also as a direct child of a top-level
 *    question. Attaching it in both places is what duplicated nodes.
 *  - Siblings are ordered by their first message's `createdAt`, at every depth.
 */
export function buildQuestionTree(
  topicId: string,
  byTopic: Record<string, MessageMap>,
): QuestionNode[] {
  const map = byTopic[topicId];
  if (!map) return [];

  const byBranch: Record<string, Message[]> = {};
  for (const id in map) {
    const m = map[id];
    (byBranch[m.branchId] ??= []).push(m);
  }
  for (const b in byBranch) byBranch[b].sort((a, b2) => a.createdAt - b2.createdAt);

  const mainMsgs = byBranch['main'] ?? [];
  const userMsgs = mainMsgs.filter((m) => m.role === 'user');

  // Which main-thread question does each main message fall under? The most
  // recent user message at or before it.
  const msgIdToQuestionIdx: Record<string, number> = {};
  for (const msg of mainMsgs) {
    for (let j = userMsgs.length - 1; j >= 0; j--) {
      if (userMsgs[j].createdAt <= msg.createdAt) {
        msgIdToQuestionIdx[msg.id] = j;
        break;
      }
    }
  }

  const firstOf = (branchId: string): Message | undefined => byBranch[branchId]?.[0];
  const startedAt = (branchId: string): number => firstOf(branchId)?.createdAt ?? 0;

  /** Non-main branch ids whose first message hangs off a message in `branchId`. */
  function childBranchesOf(branchId: string): string[] {
    const out: string[] = [];
    for (const other in byBranch) {
      if (other === 'main' || other === branchId) continue;
      const from = firstOf(other)?.branchFrom;
      if (!from) continue;
      if (map[from.parentMessageId]?.branchId !== branchId) continue;
      out.push(other);
    }
    return out.sort((a, b) => startedAt(a) - startedAt(b));
  }

  // `visited` keeps the recursion total even on malformed data. Append-only
  // creation cannot produce a cycle today, but this function is now the only
  // implementation and must not be able to hang the UI.
  function buildBranchNode(branchId: string, visited: Set<string>): QuestionNode | null {
    if (visited.has(branchId)) return null;
    visited.add(branchId);

    const messages = byBranch[branchId] ?? [];
    const first = messages[0];
    return {
      key: branchId,
      kind: 'branch',
      branchId,
      firstMessageId: first?.id ?? null,
      number: '',
      label: first?.branchFrom?.selectedText ?? branchId,
      messages,
      children: childBranchesOf(branchId)
        .map((id) => buildBranchNode(id, visited))
        .filter((n): n is QuestionNode => n !== null),
    };
  }

  // Direct sub-branches of each question: only those whose parent message is
  // itself in main. Nested ones are reached via buildBranchNode's recursion.
  const branchesByQuestion: Record<number, string[]> = {};
  for (const branchId of Object.keys(byBranch)
    .filter((b) => b !== 'main')
    .sort((a, b) => startedAt(a) - startedAt(b))) {
    const from = firstOf(branchId)?.branchFrom;
    if (!from) continue;
    const parent = map[from.parentMessageId];
    if (!parent || parent.branchId !== 'main') continue;
    const idx = msgIdToQuestionIdx[parent.id];
    if (idx === undefined) continue;
    (branchesByQuestion[idx] ??= []).push(branchId);
  }

  const visited = new Set<string>();
  const roots: QuestionNode[] = userMsgs.map((msg, idx) => {
    const next = userMsgs[idx + 1];
    return {
      key: `q-${msg.id}`,
      kind: 'main' as const,
      branchId: 'main',
      firstMessageId: msg.id,
      number: '',
      label: msg.content,
      messages: mainMsgs.filter(
        (m) => m.createdAt >= msg.createdAt && (!next || m.createdAt < next.createdAt),
      ),
      children: (branchesByQuestion[idx] ?? [])
        .map((id) => buildBranchNode(id, visited))
        .filter((n): n is QuestionNode => n !== null),
    };
  });

  // Single numbering pass so grandchildren inherit the right prefix.
  function number(nodes: QuestionNode[], prefix: string) {
    nodes.forEach((node, i) => {
      node.number = prefix ? `${prefix}.${i + 1}` : `Q${i + 1}`;
      number(node.children, node.number);
    });
  }
  number(roots, '');

  return roots;
}

/** Pre-order flatten: each question immediately followed by its branches. */
export function flattenTree(nodes: QuestionNode[]): QuestionNode[] {
  const out: QuestionNode[] = [];
  const walk = (ns: QuestionNode[]) => {
    for (const n of ns) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}
