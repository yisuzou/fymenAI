'use client';
import { useChatStore } from '@/lib/store/chatStore';
import { ClickableMarkdown } from './ClickableMarkdown';
import { useEffect, useRef } from 'react';

interface Props { threadId: string; onWordClick: (messageId: string, word: string) => void; }

export function MessageList({ threadId, onWordClick }: Props) {
  const messages = useChatStore(s => s.messagesByThread[threadId] ?? []);
  const streamingId = useChatStore(s => s.streamingMessageId);
  const bottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-4">
      {messages.map(m => (
        <div key={m.id} className={`max-w-3xl rounded-lg p-3 ${
          m.role === 'user' ? 'self-end bg-blue-50' : 'self-start bg-white shadow'
        }`}>
          {m.role === 'assistant'
            ? <ClickableMarkdown content={m.content || '...'} onWordClick={w => onWordClick(m.id, w)} />
            : <p className="whitespace-pre-wrap">{m.content}</p>}
          {streamingId === m.id && <span className="ml-1 inline-block h-3 w-2 animate-pulse bg-gray-400" />}
        </div>
      ))}
      <div ref={bottomRef} />
    </div>
  );
}
