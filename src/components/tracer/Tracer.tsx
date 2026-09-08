'use client';
import { useMemo, useState, useCallback } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { buildQuestionTree, type QuestionNode } from '@/lib/tree';

interface TracerProps {
  topicId: string;
}

export function Tracer({ topicId }: TracerProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const focusedBranchId = useUiStore((s) => s.focusedBranchId);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  const setScrollTarget = useUiStore((s) => s.setScrollTarget);
  const toggleBranch = useUiStore((s) => s.toggleBranch);
  const setMobilePane = useUiStore((s) => s.setMobilePane);

  const nodes = useMemo(() => buildQuestionTree(topicId, byTopic), [byTopic, topicId]);

  const onClickNode = useCallback(
    (branchId: string, firstMsgId: string | null) => {
      setFocused(branchId);
      if (branchId !== 'main') toggleBranch(branchId, true);
      if (firstMsgId) setScrollTarget(firstMsgId);
      // On a single-column layout the tree and its target are different panes,
      // so a click has to take the user there.
      setMobilePane(branchId === 'main' ? 'chat' : 'focus');
    },
    [setFocused, toggleBranch, setScrollTarget, setMobilePane],
  );

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
                key={node.key}
                node={node}
                onClick={onClickNode}
                focusedBranchId={focusedBranchId}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface TopLevelNodeProps {
  node: QuestionNode;
  onClick: (branchId: string, firstMsgId: string | null) => void;
  focusedBranchId: string;
}

function TopLevelNode({ node, onClick, focusedBranchId }: TopLevelNodeProps) {
  const [expanded, setExpanded] = useState(true);
  const hasChildren = node.children.length > 0;
  const isFocused = focusedBranchId === node.branchId;

  // Clicking a top-level node focuses main and scrolls to this question.
  const handleClick = useCallback(() => {
    onClick('main', node.firstMessageId);
  }, [onClick, node.firstMessageId]);

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
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '收起子分支' : '展开子分支'}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded hover:bg-white/20"
          >
            <Chevron className={`h-3 w-3 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="h-4 w-4" />
        )}
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
              key={child.key}
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
  node: QuestionNode;
  depth: number;
  onClick: (branchId: string, firstMsgId: string | null) => void;
  focusedBranchId: string;
}

function ChildNode({ node, depth, onClick, focusedBranchId }: ChildNodeProps) {
  const [expanded, setExpanded] = useState(depth <= 1);
  const hasChildren = node.children.length > 0;
  const isFocused = focusedBranchId === node.branchId;

  return (
    <div>
      <div
        className={`flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-xs ${
          isFocused ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-blue-50'
        }`}
        onClick={() => onClick(node.branchId, node.firstMessageId)}
      >
        {hasChildren ? (
          <button
            type="button"
            aria-label={expanded ? '收起子分支' : '展开子分支'}
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(!expanded);
            }}
            className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded hover:bg-gray-200"
          >
            <Chevron className={`h-2.5 w-2.5 ${expanded ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="h-3.5 w-3.5" />
        )}
        <span className="flex-shrink-0 font-medium text-blue-500">{node.number}</span>
        <span className="flex-1 truncate">「{truncate(node.label, 18)}」</span>
        <span className="flex-shrink-0 text-gray-400">({node.messages.length})</span>
      </div>
      {hasChildren && expanded && (
        <div className="ml-3 border-l border-gray-100 pl-1">
          {node.children.map((child) => (
            <ChildNode
              key={child.key}
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
