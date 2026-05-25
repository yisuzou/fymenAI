'use client';
import { useEffect, useState } from 'react';
import { useChatStore } from '@/lib/store/chatStore';
import { MessageList } from '@/components/chat/MessageList';
import { ChatInput } from '@/components/chat/ChatInput';
import { SubThreadPanel } from '@/components/thread/SubThreadPanel';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { sendMessage } from '@/lib/store/actions';

export default function Page() {
  const [rootId, setRootId] = useState<string | null>(null);
  const activeSub = useChatStore(s => s.activeSubThreadId);
  const streaming = useChatStore(s => s.streamingMessageId);

  useEffect(() => {
    if (!rootId) {
      const id = useChatStore.getState().createThread({ title: '主对话' });
      setRootId(id);
    }
  }, [rootId]);

  function onWordClick(_messageId: string, word: string, fromThreadId: string) {
    const subId = useChatStore.getState().spawnSubThread({
      parentThreadId: fromThreadId, parentMessageId: _messageId, triggerWord: word,
    });
    useChatStore.getState().setActiveSubThread(subId);
  }

  if (!rootId) return null;
  return (
    <main className="flex h-screen w-screen">
      <Sidebar />
      <section className="flex flex-1 flex-col">
        <header className="border-b bg-white p-3 font-semibold">费曼 AI · 主对话</header>
        <div className="flex-1 overflow-hidden">
          <MessageList threadId={rootId} onWordClick={(mid, w) => onWordClick(mid, w, rootId)} />
        </div>
        <ChatInput onSend={t => sendMessage(rootId, t)} disabled={!!streaming} />
      </section>
      {activeSub && (
        <SubThreadPanel
          threadId={activeSub}
          onWordClick={(mid, w) => onWordClick(mid, w, activeSub)}
          onClose={() => {
            useChatStore.getState().setActiveSubThread(null);
            useChatStore.getState().closeSubThread(activeSub);
          }}
        />
      )}
    </main>
  );
}
