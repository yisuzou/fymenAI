'use client';
import { useMemo, useState } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useFeynmanStore, type FeynmanResult } from '@/lib/store/feynmanStore';
import { useUiStore } from '@/lib/store/uiStore';
import { FeynmanCheck } from '@/components/chat/FeynmanCheck';
import { buildQuestionTree, flattenTree, type QuestionNode } from '@/lib/tree';

interface Props {
  topicId: string;
}

const EMPTY: Record<string, FeynmanResult> = {};

export function FeynmanModal({ topicId }: Props) {
  const setOpen = useUiStore((s) => s.setFeynmanModalOpen);
  const byTopic = useMessageStore((s) => s.byTopic);
  const byKey = useFeynmanStore((s) => s.byKey[topicId] ?? EMPTY);
  const legacyByLabel = useFeynmanStore((s) => s.legacyByLabel[topicId] ?? EMPTY);
  const [selected, setSelected] = useState<QuestionNode | null>(null);

  const questions = useMemo(
    () => flattenTree(buildQuestionTree(topicId, byTopic)),
    [topicId, byTopic],
  );

  function close() {
    setSelected(null);
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={close}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="费曼检验"
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="flex-shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="返回列表"
              >
                <svg
                  className="h-4 w-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="min-w-0 truncate text-base font-semibold text-green-800">
              🧠 费曼检验
              {selected && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  {selected.number} · {truncate(selected.label, 28)}
                </span>
              )}
            </h2>
          </div>
          <button
            onClick={close}
            className="flex-shrink-0 rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected ? (
            <FeynmanCheck
              key={selected.key}
              topicId={topicId}
              nodeKey={selected.key}
              topic={selected.label}
            />
          ) : questions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              暂无可检验的问题。先在主对话中提问或创建分支吧。
            </div>
          ) : (
            <ul className="divide-y">
              {questions.map((q) => {
                // Stable key first; fall back to the pre-v1 label-keyed data.
                const r = byKey[q.key] ?? legacyByLabel[q.label];
                return (
                  <li key={q.key}>
                    <button
                      onClick={() => setSelected(q)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      <span
                        className={`flex-shrink-0 font-bold ${
                          q.kind === 'main' ? 'text-green-700' : 'text-blue-600'
                        }`}
                      >
                        {q.number}
                      </span>
                      <span className="flex-1 truncate text-gray-800" title={q.label}>
                        {q.kind === 'main' ? q.label : `「${q.label}」`}
                      </span>
                      {r && <ScoreBadge score={r.score} />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 80 ? 'bg-green-500' : clamped >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <span
      className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold text-white ${color}`}
    >
      {clamped}
    </span>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + '…' : s;
}
