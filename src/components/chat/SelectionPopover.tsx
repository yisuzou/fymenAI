'use client';
import { useEffect, useRef, useState } from 'react';

export interface Selection {
  text: string;
  messageId: string | null;
  rect: { top: number; left: number };
}

function resolveMessageId(node: Node | null): string | null {
  if (!node) return null;
  let el: HTMLElement | null =
    node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (el && !el.dataset?.messageId) el = el.parentElement;
  return el?.dataset.messageId ?? null;
}

/**
 * Watches text selection within `containerRef`. Atomically snapshots
 * { text, messageId, rect } at mouseup time so the popover's onAsk
 * always receives consistent data for the selection the user made — even
 * across repeated selections under the same parent message.
 */
export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>): Selection | null {
  const [sel, setSel] = useState<Selection | null>(null);
  // Track whether the mousedown that started this mouseup happened inside
  // the popover button. If so, we must NOT re-capture/clobber the existing
  // selection state — the user is clicking to ask, not making a new selection.
  const mouseDownInPopoverRef = useRef(false);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      mouseDownInPopoverRef.current = !!target?.closest('[data-selection-popover]');
    }
    function onMouseUp() {
      // If this mouseup belongs to a popover-button click, preserve current sel.
      if (mouseDownInPopoverRef.current) {
        mouseDownInPopoverRef.current = false;
        return;
      }
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
      const messageId = resolveMessageId(node);
      const range = s.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      setSel({
        text,
        messageId,
        rect: { top: rect.top + window.scrollY, left: rect.left + rect.width / 2 + window.scrollX },
      });
    }
    function onSelectionChange() {
      const s = window.getSelection();
      if (!s || s.isCollapsed) setSel(null);
    }
    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [containerRef]);

  return sel;
}

interface PopoverProps {
  selection: Selection | null;
  onAsk: (snapshot: Selection) => void;
}

export function SelectionPopover({ selection, onAsk }: PopoverProps) {
  const ref = useRef<HTMLButtonElement>(null);
  // Remember the last selection key we fired onAsk for; subsequent clicks
  // on the same selection are ignored so the button can only create one
  // branch per selection.
  const lastFiredKeyRef = useRef<string | null>(null);
  if (!selection) return null;
  // Snapshot the selection at render time so the click handler is immune
  // to any state changes (e.g., selectionchange firing between mousedown
  // and click on this button).
  const snapshot = selection;
  const key = `${snapshot.messageId}::${snapshot.text}`;
  return (
    <button
      ref={ref}
      data-selection-popover
      onMouseDown={(e) => {
        // Prevent losing the selection before click handler fires.
        e.preventDefault();
      }}
      onClick={() => {
        if (lastFiredKeyRef.current === key) return;
        lastFiredKeyRef.current = key;
        onAsk(snapshot);
      }}
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
