'use client';
import { useMemo, useState, useCallback } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import type { Message } from '@/lib/types';
import { FeynmanCheckSidebar } from '@/components/chat/FeynmanCheckSidebar';

interface TracerNode {
  id: string;
  branchId: string;
  label: string;
  number: string;
  messages: Message[];
  children: TracerNode[];
}

function buildQuestionTree(
  topicId: string,
  byTopic: Record<string, Record<string, Message>>,
): TracerNode[] {
  const map = byTopic[topicId];
  if (!map) return [];

  // Group messages by branch
  const byBranch: Record<string, Message[]> = {};
  for (const id in map) {
    const m = map[id];
    (byBranch[m.branchId] ??= []).push(m);
  }
  for (const b in byBranch) byBranch[b].sort((a, b2) => a.createdAt - b2.createdAt);

  const mainMsgs = byBranch['main'] ?? [];
  const userMsgs = mainMsgs.filter((m) => m.role === 'user');

  // Build a map from message id to the user question it falls under
  const msgIdToQuestionIdx: Record<string, number> = {};
  for (let i = 0; i < mainMsgs.length; i++) {
    const msg = mainMsgs[i];
    // Find which user question this message belongs to
    // It belongs to the most recent user message at or before this message
    let questionIdx = -1;
    for (let j = userMsgs.length - 1; j >= 0; j--) {
      if (userMsgs[j].createdAt <= msg.createdAt) {
        questionIdx = j;
        break;
      }
    }
    if (questionIdx >= 0) {
      msgIdToQuestionIdx[msg.id] = questionIdx;
    }
  }

  // Group ONLY direct sub-branches (parent in main) by the user question they belong to.
  // Nested sub-branches (parent in another sub-branch) are picked up recursively by
  // buildBranchNode below — they must NOT also appear here, or they'd be duplicated as
  // direct children of the top-level Q node.
  const branchesByQuestion: Record<number, string[]> = {};
  const sortedBranchIds = Object.keys(byBranch)
    .filter((b) => b !== 'main')
    .sort((a, b) => (byBranch[a][0]?.createdAt ?? 0) - (byBranch[b][0]?.createdAt ?? 0));

  for (const branchId of sortedBranchIds) {
    const first = byBranch[branchId][0];
    if (!first?.branchFrom) continue;
    const parentMsg = map[first.branchFrom.parentMessageId];
    if (!parentMsg) continue;
    if (parentMsg.branchId !== 'main') continue; // nested branch — handled recursively

    const questionIdx = msgIdToQuestionIdx[parentMsg.id] ?? -1;
    if (questionIdx >= 0) {
      (branchesByQuestion[questionIdx] ??= []).push(branchId);
    }
  }

  function buildBranchNode(branchId: string): TracerNode {
    const messages = byBranch[branchId] ?? [];
    const first = messages[0];
    const label = first?.branchFrom?.selectedText ?? branchId;

    // Find child branches
    const children: TracerNode[] = [];
    for (const otherBranch in byBranch) {
      if (otherBranch === branchId || otherBranch === 'main') continue;
      const otherFirst = byBranch[otherBranch][0];
      if (!otherFirst?.branchFrom) continue;
      const parent = map[otherFirst.branchFrom.parentMessageId];
      if (!parent || parent.branchId !== branchId) continue;
      children.push(buildBranchNode(otherBranch));
    }
    children.sort((a, b) => (a.messages[0]?.createdAt ?? 0) - (b.messages[0]?.createdAt ?? 0));

    return { id: branchId, branchId, label, number: '', messages, children };
  }

  // Recursively assign correct numbers to all nodes in the tree
  function renumberTree(nodes: TracerNode[], prefix: string) {
    nodes.forEach((node, i) => {
      node.number = `${prefix}.${i + 1}`;
      renumberTree(node.children, node.number);
    });
  }

  // Build top-level nodes
  const topLevel: TracerNode[] = userMsgs.map((msg, idx) => {
    const childBranchIds = branchesByQuestion[idx] ?? [];
    const children: TracerNode[] = childBranchIds
      .map((bid) => buildBranchNode(bid))
      .sort((a, b) => (a.messages[0]?.createdAt ?? 0) - (b.messages[0]?.createdAt ?? 0));

    return {
      id: `q-${msg.id}`,
      branchId: 'main',
      label: msg.content,
      number: '', // set by renumberTree below
      messages: mainMsgs.filter((m) => {
        // Messages from this user question to the next
        const nextUser = userMsgs[idx + 1];
        if (nextUser) {
          return m.createdAt >= msg.createdAt && m.createdAt < nextUser.createdAt;
        }
        return m.createdAt >= msg.createdAt;
      }),
      children,
    };
  });

  // Single post-order numbering pass for correct grandchild numbers
  topLevel.forEach((node, i) => {
    node.number = `Q${i + 1}`;
    renumberTree(node.children, node.number);
  });

  return topLevel;
}

interface TracerProps {
  topicId: string;
}

export function Tracer({ topicId }: TracerProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const focusedBranchId = useUiStore((s) => s.focusedBranchId);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  const setScrollTarget = useUiStore((s) => s.setScrollTarget);
  const toggleBranch = useUiStore((s) => s.toggleBranch);

  const nodes = useMemo(() => buildQuestionTree(topicId, byTopic), [byTopic, topicId]);

  function onClickNode(branchId: string, firstMsgId: string | null) {
    setFocused(branchId);
    if (branchId !== 'main') toggleBranch(branchId, true);
    if (firstMsgId) setScrollTarget(firstMsgId);
  }

  return (
    <div className="flex flex-col text-sm">
      {nodes.length === 0 ? (
        <div className="px-2 py-4 text-xs text-gray-400">还没有提问记录。</div>
      ) : (
        <>
          <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            提问 Tracer
          </div>
          <div className="flex flex-col gap-1">
            {nodes.map((node) => (
              <TopLevelNode
                key={node.id}
                node={node}
                onClick={onClickNode}
                focusedBranchId={focusedBranchId}
              />
            ))}
          </div>
        </>
      )}
      <div className="mt-4 -mx-3 -mb-3">
        <FeynmanCheckSidebar topicId={topicId} />
      </div>
    </div>
  );
}

interface TopLevelNodeProps {
  node: TracerNode;
  onClick: (branchId: string, firstMsgId: string | null) => void;
  focusedBranchId: string;
}

function TopLevelNode({ node, onClick, focusedBranchId }: TopLevelNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isFocused = focusedBranchId === node.branchId;

  // For top-level nodes, clicking focuses main and scrolls to the first message of this question
  const handleClick = useCallback(() => {
    onClick('main', node.messages[0]?.id ?? null);
  }, [onClick, node.messages]);

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1.5 text-xs ${
          isFocused
            ? 'bg-[#1e3a5f] text-white'
            : 'bg-[#1e3a5f]/90 text-white/90 hover:bg-[#1e3a5f]'
        }`}
        onClick={handleClick}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-white/20"
          >
            <svg
              className={`h-3 w-3 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && <span className="h-4 w-4" />}
        <span className="flex-shrink-0 font-bold">{node.number}</span>
        <span className="flex-1 truncate">{truncate(node.label, 40)}</span>
        {hasChildren && (
          <span className="flex-shrink-0 text-white/60">({node.children.length})</span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="ml-3 border-l border-gray-200 pl-1">
          {node.children.map((child) => (
            <ChildNode
              key={child.id}
              node={child}
              depth={1}
              onClick={onClick}
              focusedBranchId={focusedBranchId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ChildNodeProps {
  node: TracerNode;
  depth: number;
  onClick: (branchId: string, firstMsgId: string | null) => void;
  focusedBranchId: string;
}

function ChildNode({ node, depth, onClick, focusedBranchId }: ChildNodeProps) {
  const [expanded, setExpanded] = useState(depth <= 1);
  const hasChildren = node.children.length > 0;
  const isFocused = focusedBranchId === node.branchId;

  const bgColors = ['bg-blue-50', 'bg-blue-50/60', 'bg-blue-50/30'];
  const bg = bgColors[Math.min(depth - 1, bgColors.length - 1)];

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
          isFocused ? 'bg-blue-100 text-blue-900' : `text-gray-700 hover:${bg}`
        }`}
        onClick={() => onClick(node.branchId, node.messages[0]?.id ?? null)}
      >
        {hasChildren && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded hover:bg-gray-200"
          >
            <svg
              className={`h-2.5 w-2.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
        {!hasChildren && <span className="h-3.5 w-3.5" />}
        <span className="flex-shrink-0 font-medium text-blue-500">{node.number}</span>
        <span className="flex-1 truncate">「{truncate(node.label, 18)}」</span>
        <span className="flex-shrink-0 text-gray-400">({node.messages.length})</span>
      </div>
      {hasChildren && expanded && (
        <div className="ml-3 border-l border-gray-100 pl-1">
          {node.children.map((child) => (
            <ChildNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onClick={onClick}
              focusedBranchId={focusedBranchId}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
