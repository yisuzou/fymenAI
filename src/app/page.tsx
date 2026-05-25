'use client';
import { useEffect } from 'react';
import { useTopicStore } from '@/lib/store/topicStore';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import { ensureTopicAndSend, loadAllTopics, loadTopicMessages } from '@/lib/store/actions';
import { ConversationView } from '@/components/chat/ConversationView';
import { ChatInput } from '@/components/chat/ChatInput';
import { Tracer } from '@/components/tracer/Tracer';
import { BranchFocusPanel } from '@/components/tracer/BranchFocusPanel';
import { TopicList } from '@/components/tracer/TopicList';

export default function Page() {
  const activeTopicId = useUiStore((s) => s.activeTopicId);
  const setActiveTopic = useUiStore((s) => s.setActiveTopic);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const topicsLoaded = useTopicStore((s) => s.loaded);
  const topicsOrder = useTopicStore((s) => s.order);
  const topics = useTopicStore((s) => s.topics);

  // Initial: load all topics, then load messages for active (or first) topic
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await loadAllTopics();
      if (cancelled) return;
      const wanted = activeTopicId && list.find((t) => t.id === activeTopicId)
        ? activeTopicId
        : list[0]?.id ?? null;
      if (wanted !== activeTopicId) setActiveTopic(wanted);
      if (wanted) await loadTopicMessages(wanted);
    })();
    return () => {
      cancelled = true;
    };
    // run once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Whenever active topic changes, ensure its messages are loaded.
  useEffect(() => {
    if (activeTopicId) void loadTopicMessages(activeTopicId);
  }, [activeTopicId]);

  const topic = activeTopicId ? topics[activeTopicId] : null;

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-50">
      {/* LEFT: Tracer + topic list */}
      <aside className="flex h-full w-72 flex-col border-r bg-white">
        <div className="border-b p-3">
          <TopicList />
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {activeTopicId ? (
            <Tracer topicId={activeTopicId} />
          ) : (
            <div className="px-2 py-4 text-xs text-gray-400">选择或创建一个主题后开始。</div>
          )}
        </div>
      </aside>

      {/* CENTER: main conversation with inline branches */}
      <section className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">主对话</div>
            <h1 className="truncate font-semibold">
              {topic?.title ?? '费曼 AI · 用提问追溯理解'}
            </h1>
          </div>
          <div className="text-xs text-gray-400">
            框选 AI 回复中的任意文本，弹出按钮即可创建分支
          </div>
        </header>
        <div className="flex-1 overflow-y-auto p-4">
          {activeTopicId ? (
            <ConversationView topicId={activeTopicId} branchId="main" />
          ) : topicsLoaded && topicsOrder.length === 0 ? (
            <div className="m-auto max-w-md rounded border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
              👋 欢迎使用费曼 AI。在下方提问，开始你的第一个学习主题。
            </div>
          ) : (
            <div className="text-sm text-gray-400">载入中…</div>
          )}
        </div>
        <ChatInput
          disabled={!!streamingId}
          placeholder={activeTopicId ? '继续主对话…' : '提出你的第一个问题…'}
          onSend={(text) => void ensureTopicAndSend(text)}
        />
      </section>

      {/* RIGHT: focused branch detail */}
      <aside className="flex h-full w-[420px] flex-col border-l bg-gray-50">
        {activeTopicId ? (
          <BranchFocusPanel topicId={activeTopicId} />
        ) : (
          <div className="m-auto px-4 text-center text-xs text-gray-400">
            创建主题后，这里会显示当前焦点分支的扁平视图。
          </div>
        )}
      </aside>
    </main>
  );
}
