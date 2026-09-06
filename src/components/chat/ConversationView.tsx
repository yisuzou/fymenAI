'use client';
import { useEffect, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useMessageStore, selectMessagesOfBranch, selectBranchesUnder } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { sendMessage } from '@/lib/store/actions';
import { Markdown } from './Markdown';
import { SelectionPopover, useTextSelection, type Selection } from './SelectionPopover';
import { BranchBadge } from './BranchBadge';

interface Props {
  topicId: string;
  branchId: string;
}

export function ConversationView({ topicId, branchId }: Props) {
  // Subscribe to the ID LIST only. Subscribing to the whole `byTopic` map meant
  // every streamed token re-rendered every message in the branch; now the list
  // is shallow-compared and only the message that changed re-renders itself.
  const messageIds = useMessageStore(
    useShallow((s) => selectMessagesOfBranch(s.byTopic, topicId, branchId).map((m) => m.id)),
  );
  const hydrated = useMessageStore((s) => !!s.hydratedTopics[topicId]);

  const containerRef = useRef<HTMLDivElement>(null);
  const selection = useTextSelection(containerRef);
  const setFocused = useUiStore((s) => s.setFocusedBranch);
  // Guard against double-fires for the same (parentMessageId, selectedText)
  // within a short window (e.g., StrictMode, accidental double-click,
  // duplicate listeners across mounted ConversationViews).
  const inFlightRef = useRef<Set<string>>(new Set());

  function onAsk(snapshot: Selection) {
    if (!snapshot.messageId) return;
    const key = `${snapshot.messageId}::${snapshot.text}`;
    if (inFlightRef.current.has(key)) return;
    inFlightRef.current.add(key);
    window.getSelection()?.removeAllRanges();
    void sendMessage({
      topicId,
      branchId,
      text: `请详细解释「${snapshot.text}」`,
      newBranch: { parentMessageId: snapshot.messageId, selectedText: snapshot.text },
    })
      .then(({ branchId: newId }) => {
        setFocused(newId);
      })
      .finally(() => {
        // Keep the guard for a beat after completion to swallow late
        // duplicate clicks; then release so the user can re-ask later.
        setTimeout(() => inFlightRef.current.delete(key), 1000);
      });
  }

  return (
    <div ref={containerRef} className="flex w-full min-w-0 flex-col gap-3">
      {messageIds.map((id) => (
        <MessageNode key={id} messageId={id} topicId={topicId} />
      ))}
      {messageIds.length === 0 &&
        (hydrated ? (
          <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            开始一个新的提问吧。AI 回复后，框选任意文本即可创建追问分支。
          </div>
        ) : (
          <MessageSkeleton />
        ))}
      <SelectionPopover selection={selection} onAsk={onAsk} />
    </div>
  );
}

/** Shown while a topic's messages are still loading, so an in-flight fetch is
 *  not mistaken for an empty conversation. */
function MessageSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <div className="self-end h-9 w-2/5 animate-pulse rounded-lg bg-blue-50" />
      <div className="h-24 w-4/5 animate-pulse rounded-lg border border-gray-100 bg-gray-50" />
      <div className="self-end h-9 w-1/3 animate-pulse rounded-lg bg-blue-50" />
    </div>
  );
}

interface NodeProps {
  messageId: string;
  topicId: string;
}

function MessageNode({ messageId, topicId }: NodeProps) {
  const message = useMessageStore((s) => s.byTopic[topicId]?.[messageId]);
  const isStreaming = useMessageStore((s) => s.streamingMessageId === messageId);
  const branches = useMessageStore(
    useShallow((s) => selectBranchesUnder(s.byTopic, topicId, messageId)),
  );

  const scrollTarget = useUiStore((s) => s.scrollTargetMessageId);
  const setScrollTarget = useUiStore((s) => s.setScrollTarget);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollTarget === messageId && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setScrollTarget(null);
    }
  }, [scrollTarget, messageId, setScrollTarget]);

  if (!message) return null;
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
        {isStreaming && (
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
