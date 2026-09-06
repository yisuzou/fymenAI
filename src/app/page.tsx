'use client';
import { useEffect, useCallback, useRef } from 'react';
import { useTopicStore } from '@/lib/store/topicStore';
import { useMessageStore } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import {
  ensureTopicAndSend,
  loadAllTopics,
  loadTopicMessages,
  stopStreaming,
} from '@/lib/store/actions';
import { ConversationView } from '@/components/chat/ConversationView';
import { ChatInput } from '@/components/chat/ChatInput';
import { FeynmanModal } from '@/components/chat/FeynmanModal';
import { Tracer } from '@/components/tracer/Tracer';
import { BranchFocusPanel } from '@/components/tracer/BranchFocusPanel';
import { TopicList } from '@/components/tracer/TopicList';

const TABS = [
  { id: 'tree', label: '树', icon: '🌳' },
  { id: 'chat', label: '对话', icon: '💬' },
  { id: 'focus', label: '焦点', icon: '🔍' },
] as const;

export default function Page() {
  const activeTopicId = useUiStore((s) => s.activeTopicId);
  const setActiveTopic = useUiStore((s) => s.setActiveTopic);
  const feynmanModalOpen = useUiStore((s) => s.feynmanModalOpen);
  const setFeynmanModalOpen = useUiStore((s) => s.setFeynmanModalOpen);
  const mobilePane = useUiStore((s) => s.mobilePane);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const lastError = useUiStore((s) => s.lastError);
  const setLastError = useUiStore((s) => s.setLastError);
  const streamingId = useMessageStore((s) => s.streamingMessageId);
  const topicsLoaded = useTopicStore((s) => s.loaded);
  const topicsOrder = useTopicStore((s) => s.order);
  const topics = useTopicStore((s) => s.topics);

  // Resizable right panel (persisted in uiStore)
  const rightWidth = useUiStore((s) => s.rightPanelWidth);
  const setRightWidth = useUiStore((s) => s.setRightPanelWidth);
  const rightWidthRef = useRef(420);
  // Keep rightWidthRef in sync
  useEffect(() => {
    rightWidthRef.current = rightWidth;
  }, [rightWidth]);

  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = rightWidthRef.current;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    function onPointerMove(e: PointerEvent) {
      if (!isDragging.current) return;
      const delta = startX.current - e.clientX;
      setRightWidth(Math.min(800, Math.max(280, startWidth.current + delta)));
    }
    function onPointerUp() {
      if (!isDragging.current) return;
      isDragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [setRightWidth]);

  // 1. Load the topic list once.
  useEffect(() => {
    void loadAllTopics();
  }, []);

  // 2. Once topics are known, make sure the active one actually exists.
  useEffect(() => {
    if (!topicsLoaded) return;
    if (activeTopicId && topics[activeTopicId]) return;
    setActiveTopic(topicsOrder[0] ?? null);
  }, [topicsLoaded, activeTopicId, topics, topicsOrder, setActiveTopic]);

  // 3. Load messages for the active topic, exactly once per topic.
  //    Previously both this effect and the bootstrap above fetched the same
  //    topic on first paint, and re-fetching a hydrated topic could replace an
  //    optimistic message that was still streaming.
  useEffect(() => {
    if (!topicsLoaded || !activeTopicId) return;
    if (!useTopicStore.getState().topics[activeTopicId]) return;
    if (useMessageStore.getState().hydratedTopics[activeTopicId]) return;
    void loadTopicMessages(activeTopicId);
  }, [topicsLoaded, activeTopicId]);

  const topic = activeTopicId ? topics[activeTopicId] : null;
  const paneClass = (id: (typeof TABS)[number]['id']) =>
    mobilePane === id ? 'flex' : 'hidden lg:flex';

  return (
    <main className="flex h-dvh w-full flex-col bg-gray-50 lg:flex-row lg:overflow-hidden">
      {lastError && (
        <div
          role="alert"
          className="flex shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 lg:hidden"
        >
          <span className="min-w-0 flex-1">{lastError}</span>
          <button onClick={() => setLastError(null)} className="text-red-500 hover:text-red-700">
            关闭
          </button>
        </div>
      )}

      {/* LEFT: Tracer + topic list */}
      <aside
        className={`min-h-0 w-full flex-1 flex-col border-r bg-white lg:h-full lg:w-72 lg:flex-none ${paneClass('tree')}`}
      >
        <div className="border-b p-3">
          <TopicList />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {activeTopicId ? (
            <Tracer topicId={activeTopicId} />
          ) : (
            <div className="px-2 py-4 text-xs text-gray-400">选择或创建一个主题后开始。</div>
          )}
        </div>
        {activeTopicId && (
          <div className="border-t p-3">
            <button
              onClick={() => setFeynmanModalOpen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700 transition hover:bg-green-100"
            >
              <span>🧠</span>
              <span>费曼检验</span>
            </button>
          </div>
        )}
      </aside>

      {/* CENTER: main conversation with inline branches */}
      <section
        className={`min-h-0 min-w-0 flex-1 flex-col lg:h-full ${paneClass('chat')}`}
      >
        <header className="flex shrink-0 items-center justify-between border-b bg-white px-4 py-3">
          <div className="min-w-0">
            <div className="text-xs uppercase tracking-wide text-gray-500">主对话</div>
            <h1 className="truncate font-semibold">
              {topic?.title ?? '费曼 AI · 用提问追溯理解'}
            </h1>
          </div>
          <div className="hidden text-xs text-gray-400 lg:block">
            框选 AI 回复中的任意文本，弹出按钮即可创建分支
          </div>
        </header>

        {lastError && (
          <div
            role="alert"
            className="hidden shrink-0 items-start gap-2 border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-800 lg:flex"
          >
            <span className="min-w-0 flex-1">{lastError}</span>
            <button onClick={() => setLastError(null)} className="text-red-500 hover:text-red-700">
              关闭
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
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
          streaming={!!streamingId}
          onStop={() => stopStreaming()}
          placeholder={activeTopicId ? '继续主对话…' : '提出你的第一个问题…'}
          onSend={(text) => void ensureTopicAndSend(text)}
        />
      </section>

      {/* Drag handle (desktop only) */}
      <div
        className="group relative hidden w-1 flex-shrink-0 cursor-col-resize items-center justify-center bg-gray-200 hover:bg-blue-300 active:bg-blue-400 lg:flex"
        onPointerDown={onPointerDown}
        role="separator"
        aria-orientation="vertical"
        aria-label="调整右侧面板宽度"
      >
        <div className="flex flex-col items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="h-1 w-1 rounded-full bg-gray-400" />
          <div className="h-1 w-1 rounded-full bg-gray-400" />
          <div className="h-1 w-1 rounded-full bg-gray-400" />
        </div>
      </div>

      {/* RIGHT: focused branch detail */}
      <aside
        className={`min-h-0 w-full flex-1 flex-col border-l bg-gray-50 lg:h-full lg:w-[var(--right-width)] lg:flex-none ${paneClass('focus')}`}
        style={{ '--right-width': `${rightWidth}px` } as React.CSSProperties}
      >
        {activeTopicId ? (
          <BranchFocusPanel topicId={activeTopicId} />
        ) : (
          <div className="m-auto px-4 text-center text-xs text-gray-400">
            创建主题后，这里会显示当前焦点分支的扁平视图。
          </div>
        )}
      </aside>

      {/* Bottom tab bar (mobile only) */}
      <nav
        className="flex shrink-0 border-t bg-white lg:hidden"
        aria-label="切换视图"
      >
        {TABS.map((t) => {
          const active = mobilePane === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setMobilePane(t.id)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                active ? 'text-blue-600' : 'text-gray-500'
              }`}
            >
              <span aria-hidden className="text-base leading-none">
                {t.icon}
              </span>
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {feynmanModalOpen && activeTopicId && <FeynmanModal topicId={activeTopicId} />}
    </main>
  );
}
