'use client';
import { useState } from 'react';

interface Props {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  size?: 'md' | 'sm';
  /** When true the send button becomes a stop button. */
  streaming?: boolean;
  /** Cancel the in-flight generation. Required for `streaming` to show. */
  onStop?: () => void;
}

export function ChatInput({
  onSend,
  disabled,
  placeholder,
  size = 'md',
  streaming,
  onStop,
}: Props) {
  const [value, setValue] = useState('');
  const sm = size === 'sm';
  const canStop = !!streaming && !!onStop;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) return;
        onSend(v);
        setValue('');
      }}
      className={`flex gap-2 border-t bg-white ${sm ? 'p-2' : 'p-3'}`}
    >
      <input
        className={`flex-1 rounded border border-gray-300 ${sm ? 'px-2 py-1 text-sm' : 'px-3 py-2'} focus:border-blue-500 focus:outline-none`}
        placeholder={placeholder ?? '问点什么…'}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        disabled={disabled}
        aria-label="输入你的问题"
      />
      {canStop ? (
        <button
          type="button"
          onClick={onStop}
          className={`rounded border border-gray-300 bg-white ${sm ? 'px-3 py-1 text-sm' : 'px-4 py-2'} text-gray-700 hover:bg-gray-50`}
        >
          停止
        </button>
      ) : (
        <button
          className={`rounded bg-blue-600 ${sm ? 'px-3 py-1 text-sm' : 'px-4 py-2'} text-white disabled:bg-gray-300`}
          disabled={disabled || !value.trim()}
        >
          发送
        </button>
      )}
    </form>
  );
}
