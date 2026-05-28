'use client';
import { useMemo, useState } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useFeynmanStore } from '@/lib/store/feynmanStore';
import type { Message } from '@/lib/types';

interface MindmapNode {
  id: string;
  branchId: string;
  label: string;
  fullLabel: string;
  summary: string;
  childCount: number;
  children: MindmapNode[];
}

function buildMindmapTree(
  topicId: string,
  byTopic: Record<string, Record<string, Message>>,
): MindmapNode[] {
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

  // Map message ids to question index
  const msgIdToQuestionIdx: Record<string, number> = {};
  for (let i = 0; i < mainMsgs.length; i++) {
    const msg = mainMsgs[i];
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

  // Group ONLY direct sub-branches (parent in main) by question. Nested sub-branches
  // are picked up recursively by buildBranchNode — must not appear here too.
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

  function getAiSummary(branchId: string): string {
    const msgs = byBranch[branchId] ?? [];
    const aiMsg = msgs.find((m) => m.role === 'assistant');
    if (!aiMsg) return '';
    return aiMsg.content.length > 60 ? aiMsg.content.slice(0, 60) + '…' : aiMsg.content;
  }

  function buildBranchNode(branchId: string): MindmapNode {
    const messages = byBranch[branchId] ?? [];
    const first = messages[0];
    const label = first?.branchFrom?.selectedText ?? branchId;
    const summary = getAiSummary(branchId);

    const children: MindmapNode[] = [];
    for (const otherBranch in byBranch) {
      if (otherBranch === branchId || otherBranch === 'main') continue;
      const otherFirst = byBranch[otherBranch][0];
      if (!otherFirst?.branchFrom) continue;
      const parent = map[otherFirst.branchFrom.parentMessageId];
      if (!parent || parent.branchId !== branchId) continue;
      children.push(buildBranchNode(otherBranch));
    }
    children.sort((a, b) => {
      const aMsg = byBranch[a.branchId]?.[0];
      const bMsg = byBranch[b.branchId]?.[0];
      return (aMsg?.createdAt ?? 0) - (bMsg?.createdAt ?? 0);
    });

    return {
      id: branchId,
      branchId,
      label,
      fullLabel: label,
      summary,
      childCount: children.length,
      children,
    };
  }

  return userMsgs.map((msg, idx) => {
    const mainAiMsg = mainMsgs.find(
      (m) => m.role === 'assistant' && m.createdAt > msg.createdAt,
    );
    const aiSummary = mainAiMsg
      ? mainAiMsg.content.length > 60
        ? mainAiMsg.content.slice(0, 60) + '…'
        : mainAiMsg.content
      : '';

    const childBranchIds = branchesByQuestion[idx] ?? [];
    const children = childBranchIds
      .map((bid) => buildBranchNode(bid))
      .sort((a, b) => {
        const aMsg = byBranch[a.branchId]?.[0];
        const bMsg = byBranch[b.branchId]?.[0];
        return (aMsg?.createdAt ?? 0) - (bMsg?.createdAt ?? 0);
      });

    return {
      id: `q-${msg.id}`,
      branchId: 'main',
      label: msg.content.length > 40 ? msg.content.slice(0, 40) + '…' : msg.content,
      fullLabel: msg.content,
      summary: aiSummary,
      childCount: children.length,
      children,
    };
  });
}

interface MindmapProps {
  topicId: string;
}

export function Mindmap({ topicId }: MindmapProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  const toggleBranch = useUiStore((s) => s.toggleBranch);

  const nodes = useMemo(() => buildMindmapTree(topicId, byTopic), [byTopic, topicId]);

  function handleClick(branchId: string) {
    setFocused(branchId);
    if (branchId !== 'main') toggleBranch(branchId, true);
  }

  if (nodes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-gray-400">
        暂无提问数据，知识图谱将在主对话中提问后显示。
      </div>
    );
  }

  return (
    <div className="space-y-4 p-2">
      {nodes.map((node, idx) => (
        <RootCard key={node.id} node={node} index={idx} onClick={handleClick} topicId={topicId} />
      ))}
    </div>
  );
}

interface RootCardProps {
  node: MindmapNode;
  index: number;
  onClick: (branchId: string) => void;
  topicId: string;
}

function RootCard({ node, index, onClick, topicId }: RootCardProps) {
  const [expanded, setExpanded] = useState(true);
  const result = useFeynmanStore((s) => s.results[topicId]?.[node.fullLabel]);

  return (
    <div>
      {/* Root question card */}
      <div
        className="cursor-pointer rounded-lg border border-[#1e3a5f]/20 bg-[#1e3a5f] p-3 text-white shadow-sm transition-shadow hover:shadow-md"
        onClick={() => onClick(node.branchId)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold text-white/70">Q{index + 1}</div>
              {result && <RootScoreBadge score={result.score} />}
            </div>
            <div className="mt-0.5 text-sm font-medium leading-snug">{node.label}</div>
            {node.summary && (
              <div className="mt-1 text-xs leading-relaxed text-white/60">{node.summary}</div>
            )}
          </div>
          {node.childCount > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-white/10 hover:bg-white/20"
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
        </div>
        {node.childCount > 0 && (
          <div className="mt-1.5 text-xs text-white/50">{node.childCount} 个子分支</div>
        )}
      </div>

      {/* Sub-branches */}
      {expanded && node.children.length > 0 && (
        <div className="relative ml-6 mt-1">
          {/* Vertical connecting line */}
          <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-300" />
          <div className="space-y-1 pl-4">
            {node.children.map((child) => (
              <BranchNode key={child.id} node={child} depth={1} onClick={onClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface BranchNodeProps {
  node: MindmapNode;
  depth: number;
  onClick: (branchId: string) => void;
}

function BranchNode({ node, depth, onClick }: BranchNodeProps) {
  const [expanded, setExpanded] = useState(depth <= 1);

  const bgColors = ['bg-[#dbeafe]', 'bg-[#fff7ed]', 'bg-gray-50', 'bg-gray-50/60'];
  const bg = bgColors[Math.min(depth - 1, bgColors.length - 1)];
  const borderColors = ['border-blue-200', 'border-orange-200', 'border-gray-200', 'border-gray-100'];
  const border = borderColors[Math.min(depth - 1, borderColors.length - 1)];

  return (
    <div>
      <div className="relative">
        {/* Horizontal connecting line */}
        <div className="absolute left-[-16px] top-3 h-px w-4 bg-gray-300" />
        <div
          className={`cursor-pointer rounded-md border ${border} ${bg} p-2 text-xs transition-shadow hover:shadow-sm`}
          onClick={() => onClick(node.branchId)}
        >
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium text-gray-800">「{truncate(node.label, 30)}」</div>
              {node.summary && (
                <div className="mt-0.5 text-gray-500 leading-relaxed">{truncate(node.summary, 50)}</div>
              )}
            </div>
            {node.childCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-black/5"
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
          </div>
          {node.childCount > 0 && (
            <div className="mt-1 text-gray-400">{node.childCount} 个子分支</div>
          )}
        </div>
      </div>

      {expanded && node.children.length > 0 && (
        <div className="relative ml-6 mt-1">
          <div className="absolute left-0 top-0 bottom-0 w-px bg-gray-200" />
          <div className="space-y-1 pl-4">
            {node.children.map((child) => (
              <BranchNode key={child.id} node={child} depth={depth + 1} onClick={onClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function RootScoreBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 80 ? 'bg-green-500' : clamped >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <span
      className={`rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${color}`}
      title="费曼检验得分"
    >
      🧠 {clamped}
    </span>
  );
}
