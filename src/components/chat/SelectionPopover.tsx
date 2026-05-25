'use client';
import { useEffect, useRef, useState } from 'react';

interface Selection {
  text: string;
  rect: { top: number; left: number };
}

/** Watches text selection within `containerRef`. Returns a {text, rect} or null. */
export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>): Selection | null {
  const [sel, setSel] = useState<Selection | null>(null);

  useEffect(() => {
    function onMouseUp() {
      const s = window.getSelection();
      if (!s || s.isCollapsed) {
        setSel(null);
        return;
      }
      const text = s.toString().trim();
      if (!text) {
        setSel(null);
        return;
      }
      const node = s.anchorNode;
      const container = containerRef.current;
      if (!container || !node || !container.contains(node)) {
        setSel(null);
        return;
      }
      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSel({
        text,
        rect: { top: rect.top + window.scrollY, left: rect.left + rect.width / 2 + window.scrollX },
      });
    }
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed) setSel(null);
    });
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [containerRef]);

  return sel;
}

interface PopoverProps {
  selection: Selection | null;
  onAsk: (text: string) => void;
}

export function SelectionPopover({ selection, onAsk }: PopoverProps) {
  const ref = useRef<HTMLButtonElement>(null);
  if (!selection) return null;
  return (
    <button
      ref={ref}
      onMouseDown={(e) => {
        // Prevent losing the selection before click handler fires.
        e.preventDefault();
      }}
      onClick={() => onAsk(selection.text)}
      style={{
        position: 'fixed',
        top: selection.rect.top - window.scrollY - 40,
        left: selection.rect.left - window.scrollX,
        transform: 'translateX(-50%)',
      }}
      className="z-50 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-blue-700"
    >
      💡 追问「{selection.text.length > 12 ? selection.text.slice(0, 12) + '…' : selection.text}」
    </button>
  );
}
