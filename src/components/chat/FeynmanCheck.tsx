'use client';
import { useState } from 'react';
import { fetchStream } from '@/lib/utils/fetchStream';
import { parseGrade, type GradeResult } from '@/lib/utils/grader';
import { useFeynmanStore } from '@/lib/store/feynmanStore';

interface Props {
  topic: string;
  topicId?: string;
}

export function FeynmanCheck({ topic, topicId }: Props) {
  const saveResult = useFeynmanStore((s) => s.setResult);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!input.trim() || loading) return;
    setLoading(true);
    setResult(null);
    setError(null);
    setRaw('');
    const userMessage = `我学习的概念是：「${topic}」\n\n我的复述：\n${input.trim()}`;
    let acc = '';
    try {
      for await (const chunk of fetchStream('/api/chat', {
        mode: 'grade',
        messages: [{ role: 'user', content: userMessage }],
      })) {
        acc += chunk;
        setRaw(acc);
      }
      const parsed = parseGrade(acc);
      if (!parsed) {
        setError('无法解析评估结果，请重试。');
      } else {
        setResult(parsed);
        if (topicId) {
          saveResult(topicId, topic, { ...parsed, testedAt: Date.now() });
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function handleReset() {
    setResult(null);
    setRaw('');
    setError(null);
    setInput('');
  }

  if (!open) {
    return (
      <div className="border-t bg-green-50/50 px-4 py-2">
        <button
          onClick={() => setOpen(true)}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-green-300 bg-white px-3 py-2 text-sm font-medium text-green-700 transition hover:bg-green-50"
        >
          <span>🧠</span>
          <span>用自己的话复述（费曼检验）</span>
        </button>
      </div>
    );
  }

  return (
    <div className="border-t bg-green-50/50 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-sm font-medium text-green-800">
          费曼检验：「{topic}」
        </div>
        <button
          onClick={() => setOpen(false)}
          className="text-xs text-gray-500 hover:text-gray-700"
        >
          收起
        </button>
      </div>

      {!result && (
        <>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="试着用你自己的话向一个新手解释这个概念……"
            rows={4}
            disabled={loading}
            className="w-full resize-none rounded-md border border-green-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-60"
          />
          <div className="mt-2 flex items-center justify-between">
            <div className="text-xs text-gray-500">
              {loading ? '正在评估…' : '提交后将由 AI 进行打分与反馈'}
            </div>
            <button
              onClick={handleSubmit}
              disabled={loading || !input.trim()}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? '评估中…' : '提交评估'}
            </button>
          </div>
          {loading && raw && (
            <pre className="mt-2 max-h-24 overflow-auto rounded border border-green-100 bg-white px-2 py-1 text-[10px] text-gray-500">
              {raw}
            </pre>
          )}
          {error && (
            <div className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
              {error}
            </div>
          )}
        </>
      )}

      {result && (
        <div className="space-y-3">
          <ScoreBar score={result.score} />

          {result.correct.length > 0 && (
            <Section
              title="✓ 理解正确"
              items={result.correct}
              className="border-green-200 bg-green-50 text-green-800"
            />
          )}
          {result.missing.length > 0 && (
            <Section
              title="! 关键缺失"
              items={result.missing}
              className="border-yellow-200 bg-yellow-50 text-yellow-800"
            />
          )}
          {result.wrong.length > 0 && (
            <Section
              title="✗ 理解错误"
              items={result.wrong}
              className="border-red-200 bg-red-50 text-red-800"
            />
          )}
          {result.advice && (
            <div className="rounded-md border border-green-200 bg-white px-3 py-2 text-sm text-gray-700">
              <div className="mb-1 text-xs font-semibold text-green-700">改进建议</div>
              {result.advice}
            </div>
          )}

          <div className="flex justify-end">
            <button
              onClick={handleReset}
              className="rounded-md border border-green-300 bg-white px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
            >
              再来一次
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const color =
    clamped >= 80 ? 'bg-green-500' : clamped >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="rounded-md border border-green-200 bg-white px-3 py-2">
      <div className="mb-1 flex items-baseline justify-between">
        <div className="text-xs font-semibold text-green-700">掌握度</div>
        <div className="text-2xl font-bold text-green-800">{clamped}</div>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className={`h-full ${color} transition-all`}
          style={{ width: `${clamped}%` }}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  className,
}: {
  title: string;
  items: string[];
  className: string;
}) {
  return (
    <div className={`rounded-md border px-3 py-2 ${className}`}>
      <div className="mb-1 text-xs font-semibold">{title}</div>
      <ul className="list-disc space-y-0.5 pl-5 text-sm">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
