'use client';
import { useMemo } from 'react';
import { useMessageStore, selectMessagesOfBranch } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { Markdown } from '@/components/chat/Markdown';
import { ChatInput } from '@/components/chat/ChatInput';
import { sendMessage } from '@/lib/store/actions';

interface Props {
  topicId: string;
}

export function BranchFocusPanel({ topicId }: Props) {
  const branchId = useUiStore((s) => s.focusedBranchId);
  const byTopic = useMessageStore((s) => s.byTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const messages = useMemo(
    () => selectMessagesOfBranch(byTopic, topicId, branchId),
    [byTopic, topicId, branchId],
  );

  const first = messages[0];
  const title =
    branchId === 'main' ? '主对话' : first?.branchFrom?.selectedText ?? '分支';

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between border-b bg-white px-4 py-3">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wide text-gray-500">
            {branchId === 'main' ? '当前焦点' : '分支焦点'}
          </div>
          <h2 className="truncate font-semibold">「{title}」</h2>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <div className="rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            在左侧 Tracer 选择一个节点查看焦点视图。
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg p-3 ${
                  m.role === 'user'
                    ? 'self-end bg-blue-50 ml-auto'
                    : 'self-start border border-gray-100 bg-white shadow-sm'
                }`}
                style={{ maxWidth: '95%' }}
              >
                {m.role === 'assistant' ? (
                  <Markdown content={m.content || '...'} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{m.content}</p>
                )}
                {streamingId === m.id && (
                  <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-gray-400" />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <ChatInput
        size="sm"
        placeholder="在此焦点分支继续追问…"
        disabled={!!streamingId}
        onSend={(text) => void sendMessage({ topicId, branchId, text })}
      />
    </div>
  );
}
