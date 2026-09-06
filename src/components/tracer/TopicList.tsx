'use client';
import { useTopicStore } from '@/lib/store/topicStore';
import { useUiStore } from '@/lib/store/uiStore';
import { createTopic, deleteTopic } from '@/lib/store/actions';
import { DEFAULT_TOPIC_TITLE } from '@/lib/constants';

export function TopicList() {
  const order = useTopicStore((s) => s.order);
  const topics = useTopicStore((s) => s.topics);
  const activeTopicId = useUiStore((s) => s.activeTopicId);
  const setActiveTopic = useUiStore((s) => s.setActiveTopic);
  const setMobilePane = useUiStore((s) => s.setMobilePane);
  const collapsed = useUiStore((s) => s.topicListCollapsed);
  const setCollapsed = useUiStore((s) => s.setTopicListCollapsed);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  async function onNew() {
    const t = await createTopic(DEFAULT_TOPIC_TITLE);
    setActiveTopic(t.id);
    setMobilePane('chat');
  }

  // No explicit load here: the page loads a topic's messages once, when it
  // becomes active and is not already hydrated. Re-fetching on every click
  // could replace a message that was still streaming.
  function onSelect(id: string) {
    setActiveTopic(id);
    setMobilePane('chat');
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex h-4 w-4 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title={collapsed ? '展开' : '收起'}
          >
            <svg
              className={`h-3 w-3 transition-transform duration-200 ${collapsed ? '-rotate-90' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">主题</div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            title="API 配置"
            aria-label="API 配置"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onNew}
            className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
          >
            + 新建
          </button>
        </div>
      </div>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${
          collapsed ? 'max-h-0 opacity-0' : 'max-h-[1000px] opacity-100'
        }`}
      >
        <ul className="mt-1 flex flex-col gap-0.5">
          {order.length === 0 && (
            <li className="px-2 py-1 text-xs text-gray-400">还没有主题，发送第一个问题来开始。</li>
          )}
          {order.map((id) => {
            const t = topics[id];
            if (!t) return null;
            const active = id === activeTopicId;
            return (
              <li key={id} className="group flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  className={`flex-1 truncate rounded px-2 py-1 text-left text-xs ${
                    active ? 'bg-blue-100 text-blue-900' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  {t.title}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`删除主题 "${t.title}"？`)) void deleteTopic(id);
                  }}
                  className="px-1 text-xs text-gray-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                  title="删除"
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
