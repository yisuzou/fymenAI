'use client';
import { useMemo, useState } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { useFeynmanStore, pickResult } from '@/lib/store/feynmanStore';
import { buildQuestionTree, type QuestionNode } from '@/lib/tree';

interface MindmapProps {
  topicId: string;
}

export function Mindmap({ topicId }: MindmapProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  const toggleBranch = useUiStore((s) => s.toggleBranch);

  const nodes = useMemo(() => buildQuestionTree(topicId, byTopic), [byTopic, topicId]);

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
      {nodes.map((node) => (
        <RootCard key={node.key} node={node} onClick={handleClick} topicId={topicId} />
      ))}
    </div>
  );
}

interface RootCardProps {
  node: QuestionNode;
  onClick: (branchId: string) => void;
  topicId: string;
}

function RootCard({ node, onClick, topicId }: RootCardProps) {
  const [expanded, setExpanded] = useState(true);
  const result = useFeynmanStore((s) => pickResult(s, topicId, node.key, node.label));
  const childCount = node.children.length;
  const summary = answerPreview(node);

  return (
    <div>
      <div
        className="cursor-pointer rounded-lg border border-[#1e3a5f]/20 bg-[#1e3a5f] p-3 text-white shadow-sm transition-shadow hover:shadow-md"
        onClick={() => onClick(node.branchId)}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <div className="text-xs font-bold text-white/70">{node.number}</div>
              {result && <ScoreBadge score={result.score} />}
            </div>
            <div className="mt-0.5 text-sm font-medium leading-snug">
              {truncate(node.label, 40)}
            </div>
            {summary && (
              <div className="mt-1 text-xs leading-relaxed text-white/60">{summary}</div>
            )}
          </div>
          {childCount > 0 && (
            <button
              type="button"
              aria-label={expanded ? '收起子分支' : '展开子分支'}
              aria-expanded={expanded}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded bg-white/10 hover:bg-white/20"
            >
              <Chevron className={`h-3 w-3 ${expanded ? 'rotate-90' : ''}`} />
            </button>
          )}
        </div>
        {childCount > 0 && (
          <div className="mt-1.5 text-xs text-white/50">{childCount} 个子分支</div>
        )}
      </div>

      {expanded && childCount > 0 && (
        <div className="relative ml-6 mt-1">
          {/* Vertical connecting line */}
          <div className="absolute bottom-0 left-0 top-0 w-px bg-gray-300" />
          <div className="space-y-1 pl-4">
            {node.children.map((child) => (
              <BranchNode key={child.key} node={child} depth={1} onClick={onClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

interface BranchNodeProps {
  node: QuestionNode;
  depth: number;
  onClick: (branchId: string) => void;
}

const BG_BY_DEPTH = ['bg-[#dbeafe]', 'bg-[#fff7ed]', 'bg-gray-50', 'bg-gray-50/60'];
const BORDER_BY_DEPTH = [
  'border-blue-200',
  'border-orange-200',
  'border-gray-200',
  'border-gray-100',
];

function BranchNode({ node, depth, onClick }: BranchNodeProps) {
  const [expanded, setExpanded] = useState(depth <= 1);
  const childCount = node.children.length;
  const summary = answerPreview(node);

  const i = Math.min(depth - 1, BG_BY_DEPTH.length - 1);
  const bg = BG_BY_DEPTH[i];
  const border = BORDER_BY_DEPTH[i];

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
              <div className="truncate font-medium text-gray-800">
                <span className="mr-1 font-semibold text-blue-600">{node.number}</span>
                「{truncate(node.label, 30)}」
              </div>
              {summary && (
                <div className="mt-0.5 leading-relaxed text-gray-500">
                  {truncate(summary, 50)}
                </div>
              )}
            </div>
            {childCount > 0 && (
              <button
                type="button"
                aria-label={expanded ? '收起子分支' : '展开子分支'}
                aria-expanded={expanded}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded(!expanded);
                }}
                className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-black/5"
              >
                <Chevron className={`h-2.5 w-2.5 ${expanded ? 'rotate-90' : ''}`} />
              </button>
            )}
          </div>
          {childCount > 0 && <div className="mt-1 text-gray-400">{childCount} 个子分支</div>}
        </div>
      </div>

      {expanded && childCount > 0 && (
        <div className="relative ml-6 mt-1">
          <div className="absolute bottom-0 left-0 top-0 w-px bg-gray-200" />
          <div className="space-y-1 pl-4">
            {node.children.map((child) => (
              <BranchNode key={child.key} node={child} depth={depth + 1} onClick={onClick} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** First few words of this node's answer, for the card subtitle. */
function answerPreview(node: QuestionNode): string {
  const ai = node.messages.find((m) => m.role === 'assistant');
  return ai ? truncate(ai.content, 60) : '';
}

function Chevron({ className }: { className?: string }) {
  return (
    <svg
      className={`transition-transform duration-150 ${className ?? ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

function ScoreBadge({ score }: { score: number }) {
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
