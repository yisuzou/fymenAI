import { useChatStore } from './chatStore';
import { fetchStream } from '@/lib/utils/fetchStream';

export async function sendMessage(threadId: string, content: string, opts?: {
  mode?: 'teach' | 'subthread'; triggerWord?: string; parentContext?: string;
}) {
  const s = useChatStore.getState();
  s.appendMessage(threadId, { role: 'user', content });
  const assistantId = s.appendMessage(threadId, { role: 'assistant', content: '' });
  s.setStreaming(assistantId);

  const history = useChatStore.getState().messagesByThread[threadId]
    .filter(m => m.role !== 'system' && m.id !== assistantId)
    .map(m => ({ role: m.role, content: m.content }));

  try {
    for await (const chunk of fetchStream('/api/chat', {
      messages: history, mode: opts?.mode ?? 'teach',
      triggerWord: opts?.triggerWord, parentContext: opts?.parentContext,
    })) {
      useChatStore.getState().appendChunkToMessage(threadId, assistantId, chunk);
    }
  } finally {
    useChatStore.getState().setStreaming(null);
  }
  return assistantId;
}
