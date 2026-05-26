'use client';
import { useMemo } from 'react';
import { useMessageStore, selectMessagesOfBranch } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { ChatInput } from '@/components/chat/ChatInput';
import { ConversationView } from '@/components/chat/ConversationView';
import { Mindmap } from '@/components/tracer/Mindmap';
import { sendMessage } from '@/lib/store/actions';

interface Props {
  topicId: string;
}

export function BranchFocusPanel({ topicId }: Props) {
  const branchId = useUiStore((s) => s.focusedBranchId);
  const byTopic = useMessageStore((s) => s.byTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const messages = useMemo(
    () => (branchId === 'main' ? [] : selectMessagesOfBranch(byTopic, topicId, branchId)),
    [byTopic, topicId, branchId],
  );

  const first = messages[0];
  const isMain = branchId === 'main';
  const title = isMain ? '知识图谱' : first?.branchFrom?.selectedText ?? '分支';

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
      <ChatInput
        size="sm"
        placeholder={isMain ? '继续主对话…' : '在此焦点分支继续追问…'}
        disabled={!!streamingId}
        onSend={(text) => void sendMessage({ topicId, branchId, text })}
      />
    </div>
  );
}
