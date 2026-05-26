'use client';
import { useMemo } from 'react';
import { useMessageStore, selectMessagesOfBranch } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { ChatInput } from '@/components/chat/ChatInput';
import { ConversationView } from '@/components/chat/ConversationView';
import { FeynmanCheck } from '@/components/chat/FeynmanCheck';
import { Mindmap } from '@/components/tracer/Mindmap';
import { sendMessage } from '@/lib/store/actions';

interface Props {
  topicId: string;
}

export function BranchFocusPanel({ topicId }: Props) {
  const branchId = useUiStore((s) => s.focusedBranchId);
  const setFocusedBranch = useUiStore((s) => s.setFocusedBranch);
  const byTopic = useMessageStore((s) => s.byTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const messages = useMemo(
    () => (branchId === 'main' ? [] : selectMessagesOfBranch(byTopic, topicId, branchId)),
    [byTopic, topicId, branchId],
  );

  const first = messages[0];
  const isMain = branchId === 'main';
  const title = isMain ? '知识图谱' : first?.branchFrom?.selectedText ?? '分支';

  function handleSend(text: string) {
    if (isMain) {
      void sendMessage({ topicId, branchId, text });
      return;
    }
    if (!first) {
      void sendMessage({ topicId, branchId, text });
      return;
    }
    // Create a SIBLING branch under the same parent as the current branch.
    // Use the parent's branchId so the new message lives in the parent branch,
    // and parentMessageId points to this branch's first message so the Tracer
    // places it as a sibling (e.g., Q1.2 next to Q1.1 under Q1).
    const parentBranchId = first.branchFrom
      ? (() => {
          const parentMsg = byTopic[topicId]?.[first.branchFrom.parentMessageId];
          return parentMsg?.branchId ?? 'main';
        })()
      : 'main';
    const selectedText = text.length > 24 ? text.slice(0, 24) + '…' : text;
    void sendMessage({
      topicId,
      branchId: parentBranchId,
      text,
      newBranch: { parentMessageId: first.id, selectedText },
    }).then(({ branchId: newId }) => {
      setFocusedBranch(newId);
    });
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            {isMain ? '知识图谱' : '分支焦点'}
          </div>
          <h2 className="truncate font-semibold" title={title}>
            {isMain ? title : `「${title}」`}
          </h2>
        </div>
      </header>
      <div className="min-w-0 flex-1 overflow-y-auto p-4">
        {isMain ? (
          <Mindmap topicId={topicId} />
        ) : messages.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            在左侧 Tracer 选择一个节点，或在主对话中点击分支标签查看完整内容。
          </div>
        ) : (
          <ConversationView topicId={topicId} branchId={branchId} />
        )}
      </div>
      {!isMain && title && <FeynmanCheck topic={title} />}
      <ChatInput
        size="sm"
        placeholder={isMain ? '继续主对话…' : '在此焦点分支继续追问…'}
        disabled={!!streamingId}
        onSend={handleSend}
      />
    </div>
  );
}
