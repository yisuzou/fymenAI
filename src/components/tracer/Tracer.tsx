'use client';
import { useMemo } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useTopicStore } from '@/lib/store/topicStore';
import type { Message } from '@/lib/types';

interface TreeNode {
  branchId: string;
  label: string;
  messages: Message[];
  children: TreeNode[];
}

function buildTree(topicId: string, byTopic: Record<string, Record<string, Message>>): TreeNode | null {
  const map = byTopic[topicId];
  if (!map) return null;

  const byBranch: Record<string, Message[]> = {};
  for (const id in map) {
    const m = map[id];
    (byBranch[m.branchId] ??= []).push(m);
  }
  for (const b in byBranch) byBranch[b].sort((a, b2) => a.createdAt - b2.createdAt);

  function build(branchId: string, label: string): TreeNode {
    const messages = byBranch[branchId] ?? [];
    const children: TreeNode[] = [];
    for (const otherBranch in byBranch) {
      if (otherBranch === branchId) continue;
      const first = byBranch[otherBranch][0];
      if (!first?.branchFrom) continue;
      const parent = map[first.branchFrom.parentMessageId];
      if (!parent || parent.branchId !== branchId) continue;
      children.push(build(otherBranch, first.branchFrom.selectedText));
    }
    children.sort((a, b) => (a.messages[0]?.createdAt ?? 0) - (b.messages[0]?.createdAt ?? 0));
    return { branchId, label, messages, children };
  }

  return build('main', '主对话');
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
  const topic = useTopicStore((s) => s.topics[topicId]);

  const tree = useMemo(() => buildTree(topicId, byTopic), [byTopic, topicId]);
  if (!tree) return null;

  function onClickNode(branchId: string, firstMsgId: string | null) {
    setFocused(branchId);
    if (branchId !== 'main') toggleBranch(branchId, true);
    if (firstMsgId) setScrollTarget(firstMsgId);
  }

  return (
    <div className="text-sm">
      <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
        提问 Tracer
      </div>
      <div className="px-1">
        <button
          type="button"
          onClick={() => onClickNode('main', tree.messages[0]?.id ?? null)}
          className={`w-full truncate rounded px-2 py-1 text-left font-medium ${
            focusedBranchId === 'main' ? 'bg-blue-100 text-blue-900' : 'hover:bg-gray-100'
          }`}
        >
          🌱 {topic?.title ?? '主题'}
        </button>
        <TracerChildren
          nodes={tree.children}
          depth={1}
          onClick={onClickNode}
          focusedBranchId={focusedBranchId}
        />
      </div>
    </div>
  );
}

interface TracerChildrenProps {
  nodes: TreeNode[];
  depth: number;
  onClick: (branchId: string, firstMsgId: string | null) => void;
  focusedBranchId: string;
}

function TracerChildren({ nodes, depth, onClick, focusedBranchId }: TracerChildrenProps) {
  if (!nodes.length) return null;
  return (
    <ul className="mt-1 flex flex-col gap-0.5">
      {nodes.map((n) => (
        <li key={n.branchId}>
          <button
            type="button"
            onClick={() => onClick(n.branchId, n.messages[0]?.id ?? null)}
            style={{ paddingLeft: 8 + depth * 12 }}
            className={`w-full truncate rounded px-2 py-1 text-left text-xs ${
              focusedBranchId === n.branchId
                ? 'bg-blue-100 text-blue-900'
                : 'text-gray-700 hover:bg-gray-100'
            }`}
          >
            <span className="text-blue-500">↳</span>{' '}
            <span className="font-medium">「{truncate(n.label, 18)}」</span>{' '}
            <span className="text-gray-400">({n.messages.length})</span>
          </button>
          <TracerChildren
            nodes={n.children}
            depth={depth + 1}
            onClick={onClick}
            focusedBranchId={focusedBranchId}
          />
        </li>
      ))}
    </ul>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
