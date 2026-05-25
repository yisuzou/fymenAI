'use client';
import { useState } from 'react';

export function ChatInput({ onSend, disabled }: { onSend: (text: string) => void; disabled?: boolean }) {
  const [value, setValue] = useState('');
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (!value.trim()) return; onSend(value.trim()); setValue(''); }}
      className="flex gap-2 border-t bg-white p-3"
    >
      <input
        className="flex-1 rounded border px-3 py-2 focus:border-blue-500 focus:outline-none"
        placeholder="问点什么…"
        value={value} onChange={e => setValue(e.target.value)} disabled={disabled}
      />
      <button className="rounded bg-blue-600 px-4 py-2 text-white disabled:bg-gray-300"
        disabled={disabled || !value.trim()}>发送</button>
    </form>
  );
}
