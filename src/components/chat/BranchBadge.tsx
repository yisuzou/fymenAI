'use client';
import { useMemo } from 'react';
import { useMessageStore, selectMessagesOfBranch } from '@/lib/store/messageStore';
import { useUiStore } from '@/lib/store/uiStore';
import type { Message } from '@/lib/types';

interface Props {
  topicId: string;
  /** First message of the branch (carries branchFrom). */
  firstMessage: Message;
}

/**
 * Compact inline badge representing a sub-branch attached to a message.
 * Click focuses the branch in the right-hand panel.
 */
export function BranchBadge({ topicId, firstMessage }: Props) {
  const branchId = firstMessage.branchId;
  const byTopic = useMessageStore((s) => s.byTopic);
  const focused = useUiStore((s) => s.focusedBranchId);
  const setFocused = useUiStore((s) => s.setFocusedBranch);

  const count = useMemo(() => {
    const msgs = selectMessagesOfBranch(byTopic, topicId, branchId);
    return msgs.filter((m) => m.role === 'assistant').length;
  }, [byTopic, topicId, branchId]);

  const isFocused = focused === branchId;
  const label = firstMessage.branchFrom?.selectedText ?? '分支';

  return (
    <button
      type="button"
      onClick={() => setFocused(branchId)}
      title={`聚焦此分支：${label}`}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs transition ${
        isFocused
          ? 'border-blue-400 bg-blue-100 text-blue-900 shadow-sm'
          : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
      }`}
    >
      <span aria-hidden className="text-blue-500">↳</span>
      <span className="max-w-[180px] truncate font-medium">「{label}」</span>
      <span className="rounded-full bg-blue-200/70 px-1.5 py-px text-[10px] font-semibold text-blue-800">
        {count} 条回复
      </span>
    </button>
  );
}
