'use client';
import { useMemo, useState } from 'react';
import { useMessageStore } from '@/lib/store/messageStore';
import { useFeynmanStore, type FeynmanResult } from '@/lib/store/feynmanStore';
import { useUiStore } from '@/lib/store/uiStore';
import { FeynmanCheck } from '@/components/chat/FeynmanCheck';
import type { Message } from '@/lib/types';

interface Props {
  topicId: string;
}

interface QuestionItem {
  key: string;
  number: string;
  label: string;
  isMain: boolean;
}

const EMPTY_RESULTS: Record<string, FeynmanResult> = {};

function collectQuestions(
  topicId: string,
  byTopic: Record<string, Record<string, Message>>,
): QuestionItem[] {
  const map = byTopic[topicId];
  if (!map) return [];

  const byBranch: Record<string, Message[]> = {};
  for (const id in map) {
    const m = map[id];
    (byBranch[m.branchId] ??= []).push(m);
  }
  for (const b in byBranch) byBranch[b].sort((a, b2) => a.createdAt - b2.createdAt);

  const mainMsgs = byBranch['main'] ?? [];
  const userMsgs = mainMsgs.filter((m) => m.role === 'user');

  const result: QuestionItem[] = [];

  function walkBranch(branchId: string, number: string) {
    const messages = byBranch[branchId] ?? [];
    const first = messages[0];
    const label = first?.branchFrom?.selectedText ?? branchId;
    result.push({ key: label, number, label, isMain: false });

    // children: branches whose first message's parent is in this branch
    const childBranches = Object.keys(byBranch)
      .filter((b) => b !== 'main' && b !== branchId)
      .filter((b) => {
        const fm = byBranch[b][0];
        if (!fm?.branchFrom) return false;
        const parent = map[fm.branchFrom.parentMessageId];
        return parent?.branchId === branchId;
      })
      .sort((a, b) => (byBranch[a][0]?.createdAt ?? 0) - (byBranch[b][0]?.createdAt ?? 0));

    childBranches.forEach((cb, i) => walkBranch(cb, `${number}.${i + 1}`));
  }

  userMsgs.forEach((msg, idx) => {
    const number = `Q${idx + 1}`;
    result.push({ key: msg.content, number, label: msg.content, isMain: true });

    // direct sub-branches whose parent message is this user msg or any main msg
    // belonging to this question (between this user msg and the next).
    const nextUser = userMsgs[idx + 1];
    const inQuestion = (m: Message) =>
      m.createdAt >= msg.createdAt && (!nextUser || m.createdAt < nextUser.createdAt);

    const directChildren = Object.keys(byBranch)
      .filter((b) => b !== 'main')
      .filter((b) => {
        const fm = byBranch[b][0];
        if (!fm?.branchFrom) return false;
        const parent = map[fm.branchFrom.parentMessageId];
        if (!parent || parent.branchId !== 'main') return false;
        return inQuestion(parent);
      })
      .sort((a, b) => (byBranch[a][0]?.createdAt ?? 0) - (byBranch[b][0]?.createdAt ?? 0));

    directChildren.forEach((cb, i) => walkBranch(cb, `${number}.${i + 1}`));
  });

  return result;
}

export function FeynmanModal({ topicId }: Props) {
  const setOpen = useUiStore((s) => s.setFeynmanModalOpen);
  const byTopic = useMessageStore((s) => s.byTopic);
  const results = useFeynmanStore((s) => s.results[topicId] ?? EMPTY_RESULTS);
  const [selected, setSelected] = useState<QuestionItem | null>(null);

  const questions = useMemo(() => collectQuestions(topicId, byTopic), [byTopic, topicId]);

  function close() {
    setSelected(null);
    setOpen(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={close}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b px-4 py-3">
          <div className="flex items-center gap-2">
            {selected && (
              <button
                onClick={() => setSelected(null)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                aria-label="返回"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
            )}
            <h2 className="text-base font-semibold text-green-800">
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
            className="rounded p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700"
            aria-label="关闭"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {selected ? (
            <FeynmanCheck key={selected.key} topicId={topicId} topic={selected.label} />
          ) : questions.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              暂无可检验的问题。先在主对话中提问或创建分支吧。
            </div>
          ) : (
            <ul className="divide-y">
              {questions.map((q) => {
                const r = results[q.key];
                return (
                  <li key={`${q.number}:${q.key}`}>
                    <button
                      onClick={() => setSelected(q)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-gray-50"
                    >
                      <span
                        className={`flex-shrink-0 font-bold ${
                          q.isMain ? 'text-green-700' : 'text-blue-600'
                        }`}
                      >
                        {q.number}
                      </span>
                      <span className="flex-1 truncate text-gray-800" title={q.label}>
                        {q.isMain ? q.label : `「${q.label}」`}
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
