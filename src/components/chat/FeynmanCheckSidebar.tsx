'use client';
import { useMemo, useState } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useFeynmanStore } from '@/lib/store/feynmanStore';
import { FeynmanCheck } from '@/components/chat/FeynmanCheck';

interface Props {
  topicId: string;
}

const EMPTY_RESULTS: Record<string, import('@/lib/store/feynmanStore').FeynmanResult> = {};

export function FeynmanCheckSidebar({ topicId }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const byTopic = useMessageStore((s) => s.byTopic);
  const results = useFeynmanStore((s) => s.results[topicId] ?? EMPTY_RESULTS);

  const questions = useMemo(() => {
    const map = byTopic[topicId];
    if (!map) return [] as { id: string; content: string; createdAt: number }[];
    return Object.values(map)
      .filter((m) => m.branchId === 'main' && m.role === 'user')
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt }));
  }, [byTopic, topicId]);

  if (!open) {
    return (
      <div className="border-t bg-white p-2">
        <button
          onClick={() => setOpen(true)}
          className="w-full rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-100"
        >
          🧠 费曼检验
        </button>
      </div>
    );
  }

  if (selected) {
    return (
      <div className="border-t bg-white">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="truncate text-xs font-semibold text-green-700" title={selected}>
            费曼检验：{truncate(selected, 24)}
          </div>
          <button
            onClick={() => setSelected(null)}
            className="flex-shrink-0 text-xs text-gray-500 hover:text-gray-700"
          >
            返回
          </button>
        </div>
        <FeynmanCheck key={`${topicId}:${selected}`} topicId={topicId} topic={selected} />
      </div>
    );
  }

  return (
    <div className="border-t bg-white">
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="text-xs font-semibold text-green-700">选择主问题进行检验</div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          收起
        </button>
      </div>
      {questions.length === 0 ? (
        <div className="px-3 py-3 text-xs text-gray-400">暂无主对话提问。</div>
      ) : (
        <ul className="max-h-64 overflow-y-auto p-2">
          {questions.map((q, i) => {
            const r = results[q.content];
            return (
              <li key={q.id}>
                <button
                  onClick={() => setSelected(q.content)}
                  className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-gray-100"
                >
                  <span className="flex-shrink-0 font-bold text-green-700">Q{i + 1}</span>
                  <span className="flex-1 truncate" title={q.content}>{q.content}</span>
                  {r && <ScoreBadge score={r.score} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 80 ? 'bg-green-500' : clamped >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <span
      className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${color}`}
    >
      {clamped}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
