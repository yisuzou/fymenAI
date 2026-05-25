'use client';
import { useEffect, useMemo, useRef } from 'react';
import { useMessageStore, selectMessagesOfBranch, selectBranchesUnder } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { sendMessage } from '@/lib/store/actions';
import { Markdown } from './Markdown';
import { SelectionPopover, useTextSelection } from './SelectionPopover';
import { BranchBadge } from './BranchBadge';
import type { Message } from '@/lib/types';

interface Props {
  topicId: string;
  branchId: string;
}

export function ConversationView({ topicId, branchId }: Props) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const messages = useMemo(
    () => selectMessagesOfBranch(byTopic, topicId, branchId),
    [byTopic, topicId, branchId],
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(containerRef);
  const setFocused = useUiStore((s) => s.setFocusedBranch);

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
      branchId,
      text: `请详细解释「${text}」`,
      newBranch: { parentMessageId: selectionMessageId, selectedText: text },
    }).then(({ branchId: newId }) => {
      setFocused(newId);
    });
    window.getSelection()?.removeAllRanges();
  }

  return (
    <div ref={containerRef} className="flex w-full min-w-0 flex-col gap-3">
      {messages.map((m) => (
        <MessageNode key={m.id} message={m} topicId={topicId} streamingId={streamingId} />
      ))}
      {messages.length === 0 && (
        <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          开始一个新的提问吧。AI 回复后，框选任意文本即可创建追问分支。
        </div>
      )}
      <SelectionPopover selection={selection} onAsk={onAsk} />
    </div>
  );
}

interface NodeProps {
  message: Message;
  topicId: string;
  streamingId: string | null;
}

function MessageNode({ message, topicId, streamingId }: NodeProps) {
  const byTopic = useMessageStore((s) => s.byTopic);
  const branches = useMemo(
    () => selectBranchesUnder(byTopic, topicId, message.id),
    [byTopic, topicId, message.id],
  );

  const scrollTarget = useUiStore((s) => s.scrollTargetMessageId);
  const setScrollTarget = useUiStore((s) => s.setScrollTarget);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTarget === message.id && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollTarget(null);
    }
  }, [scrollTarget, message.id, setScrollTarget]);

  const isAssistant = message.role === 'assistant';
  const isUser = message.role === 'user';

  return (
    <div ref={ref} className={`flex w-full min-w-0 flex-col gap-2 ${isUser ? 'items-end' : 'items-start'}`}>
      <div
        data-message-id={message.id}
        className={`min-w-0 max-w-[90%] overflow-hidden rounded-lg p-3 ${
          isUser
            ? 'bg-blue-50'
            : 'border border-gray-100 bg-white shadow-sm'
        }`}
        style={{ overflowWrap: 'break-word', wordBreak: 'break-word' }}
      >
        {isAssistant ? (
          <Markdown content={message.content || '...'} />
        ) : (
          <p className="whitespace-pre-wrap break-words text-sm">{message.content}</p>
        )}
        {streamingId === message.id && (
          <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-gray-400" />
        )}
      </div>

      {branches.length > 0 && (
        <div className={`flex max-w-[90%] flex-wrap gap-1.5 ${isUser ? 'justify-end' : 'justify-start'}`}>
          {branches.map((firstMsg) => (
            <BranchBadge key={firstMsg.branchId} topicId={topicId} firstMessage={firstMsg} />
          ))}
        </div>
      )}
    </div>
  );
}
