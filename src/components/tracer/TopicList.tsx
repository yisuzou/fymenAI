'use client';
import { useTopicStore } from '@/lib/store/topicStore';
import { useUiStore } from '@/lib/store/uiStore';
import { createTopic, deleteTopic, loadTopicMessages } from '@/lib/store/actions';

export function TopicList() {
  const order = useTopicStore((s) => s.order);
  const topics = useTopicStore((s) => s.topics);
  const activeTopicId = useUiStore((s) => s.activeTopicId);
  const setActiveTopic = useUiStore((s) => s.setActiveTopic);

  async function onNew() {
    const t = await createTopic('新主题');
    setActiveTopic(t.id);
  }

  async function onSelect(id: string) {
    setActiveTopic(id);
    await loadTopicMessages(id);
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">主题</div>
        <button
          type="button"
          onClick={onNew}
          className="rounded px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-50"
        >
          + 新建
        </button>
      </div>
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
  );
}
