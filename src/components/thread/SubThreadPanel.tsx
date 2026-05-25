'use client';
import { useChatStore } from '@/lib/store/chatStore';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { sendMessage } from '@/lib/store/actions';
import { useEffect, useRef } from 'react';

export function SubThreadPanel({ threadId, onWordClick, onClose }: {
  threadId: string; onWordClick: (mid: string, w: string) => void; onClose: () => void;
}) {
  const thread = useChatStore(s => s.threads[threadId]);
  const messages = useChatStore(s => s.messagesByThread[threadId] ?? []);
  const streaming = useChatStore(s => s.streamingMessageId);
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || messages.length > 0 || !thread?.triggerWord) return;
    fired.current = true;
    const parentCtx = useChatStore.getState().getParentContext(threadId);
    sendMessage(threadId, `请解释「${thread.triggerWord}」`, {
      mode: 'subthread', triggerWord: thread.triggerWord, parentContext: parentCtx,
    });
  }, [threadId, thread?.triggerWord, messages.length]);

  if (!thread) return null;
  return (
    <aside className="flex h-full w-[440px] flex-col border-l bg-gray-50">
      <header className="flex items-center justify-between border-b bg-white p-3">
        <div className="truncate">
          <span className="text-xs text-gray-500">子线程</span>
          <h2 className="font-semibold">「{thread.triggerWord}」</h2>
        </div>
        <button onClick={onClose} className="rounded px-2 py-1 hover:bg-gray-100">✕</button>
      </header>
      <div className="flex-1 overflow-hidden">
        <MessageList threadId={threadId} onWordClick={onWordClick} />
      </div>
      <ChatInput onSend={t => sendMessage(threadId, t)} disabled={!!streaming} />
    </aside>
  );
}
