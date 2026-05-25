'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useMessageStore, selectMessagesOfBranch, selectBranchesUnder } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { sendMessage } from '@/lib/store/actions';
import { Markdown } from './Markdown';
import { ChatInput } from './ChatInput';
import { SelectionPopover, useTextSelection } from './SelectionPopover';
import type { Message } from '@/lib/types';

interface Props {
  topicId: string;
  branchId: string;
  /** Indentation depth for nested branches (0 = main). */
  depth?: number;
}

export function ConversationView({ topicId, branchId, depth = 0 }: Props) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const messages = useMemo(
    () => selectMessagesOfBranch(byTopic, topicId, branchId),
    [byTopic, topicId, branchId],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(containerRef);

  // Determine which assistant message the active selection lives in, if any.
  const selectionMessageId = useMemo(() => {
    if (!selection) return null;
    const s = window.getSelection();
    if (!s || s.rangeCount === 0) return null;
    const node = s.anchorNode as Node | null;
    if (!node) return null;
    let el: HTMLElement | null =
      node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    while (el && !el.dataset?.messageId) el = el.parentElement;
    return el?.dataset.messageId ?? null;
  }, [selection]);

  function onAsk(text: string) {
    if (!selectionMessageId) return;
    void sendMessage({
      topicId,
      branchId, // unused — newBranch overrides
      text: `请详细解释「${text}」`,
      newBranch: { parentMessageId: selectionMessageId, selectedText: text },
    });
    window.getSelection()?.removeAllRanges();
    // Auto-open the new branch — it will be keyed by the new user message id;
    // the store will surface it under selectBranchesUnder shortly.
    // We can't know the id here without coupling; the BranchBlock auto-renders.
  }

  return (
    <div ref={containerRef} className="flex flex-col gap-3">
      {messages.map((m) => (
        <MessageNode key={m.id} message={m} topicId={topicId} branchId={branchId} depth={depth} streamingId={streamingId} />
      ))}
      {messages.length === 0 && depth === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          开始一个新的提问吧。AI 回复后，框选任意文本即可创建追问分支。
        </div>
      )}
      {depth === 0 && <SelectionPopover selection={selection} onAsk={onAsk} />}
    </div>
  );
}

interface NodeProps {
  message: Message;
  topicId: string;
  branchId: string;
  depth: number;
  streamingId: string | null;
}

function MessageNode({ message, topicId, depth, streamingId }: NodeProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const branches = useMemo(
    () => selectBranchesUnder(byTopic, topicId, message.id),
    [byTopic, topicId, message.id],
  );

  const expanded = useUiStore((s) => s.expandedBranches);
  const toggleBranch = useUiStore((s) => s.toggleBranch);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  const scrollTarget = useUiStore((s) => s.scrollTargetMessageId);
  const setScrollTarget = useUiStore((s) => s.setScrollTarget);
  const ref = useRef<HTMLDivElement>(null);

  // Scroll into view when this message is the target.
  useEffect(() => {
    if (scrollTarget === message.id && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollTarget(null);
    }
  }, [scrollTarget, message.id, setScrollTarget]);

  const isAssistant = message.role === 'assistant';

  return (
    <div ref={ref} className="flex flex-col gap-2">
      <div
        data-message-id={message.id}
        className={`max-w-full rounded-lg p-3 ${
          message.role === 'user'
            ? 'self-end bg-blue-50 ml-auto'
            : 'self-start bg-white shadow-sm border border-gray-100'
        }`}
        style={{ maxWidth: '90%' }}
      >
        {isAssistant ? (
          <Markdown content={message.content || '...'} />
        ) : (
          <p className="whitespace-pre-wrap text-sm">{message.content}</p>
        )}
        {streamingId === message.id && (
          <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-gray-400" />
        )}
      </div>

      {/* Inline branch blocks for any branches hanging off THIS message */}
      {branches.map((firstMsg) => {
        const bId = firstMsg.branchId;
        const open = expanded[bId] !== false; // default open after creation
        return (
          <div
            key={bId}
            className="ml-6 rounded-lg border-l-4 border-blue-400 bg-blue-50/30"
            style={{ marginLeft: 16 + Math.min(depth, 3) * 8 }}
          >
            <button
              type="button"
              onClick={() => {
                toggleBranch(bId, !open);
                setFocused(bId);
              }}
              className="flex w-full items-center gap-2 rounded-t-lg bg-blue-100/60 px-3 py-1.5 text-left text-xs hover:bg-blue-100"
            >
              <span className="text-blue-600">{open ? '▼' : '▶'}</span>
              <span className="text-gray-500">追问：</span>
              <span className="truncate font-medium text-blue-900">
                「{firstMsg.branchFrom?.selectedText ?? ''}」
              </span>
            </button>
            {open && (
              <div className="p-3">
                <ConversationView topicId={topicId} branchId={bId} depth={depth + 1} />
                <BranchComposer topicId={topicId} branchId={bId} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function BranchComposer({ topicId, branchId }: { topicId: string; branchId: string }) {
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  return (
    <div className="mt-2">
      <ChatInput
        size="sm"
        placeholder="在此分支继续追问…"
        disabled={!!streamingId}
        onSend={(text) => void sendMessage({ topicId, branchId, text })}
      />
    </div>
  );
}
