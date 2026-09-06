'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export interface Selection {
  text: string;
  messageId: string | null;
  /** Viewport coordinates of the selection: `left` is its horizontal centre. */
  rect: { top: number; bottom: number; left: number };
}

function resolveMessageId(node: Node | null): string | null {
  if (!node) return null;
  let el: HTMLElement | null =
    node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
  while (el && !el.dataset?.messageId) el = el.parentElement;
  return el?.dataset.messageId ?? null;
}

/** Keys that can extend or move a selection without a pointer. */
const SELECTION_KEYS = new Set([
  'Shift',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'a', // ctrl/cmd + A
  'A',
]);

/**
 * Watches text selection within `containerRef`. Atomically snapshots
 * { text, messageId, rect } when the selection settles, so the popover's onAsk
 * always receives consistent data for the selection the user made — even
 * across repeated selections under the same parent message.
 *
 * Listens on pointer events rather than mouse events so touch and pen work
 * (on a phone the old mouse-only listeners meant the branch button never
 * appeared at all), plus keyup so a keyboard-only selection is offered too.
 */
export function useTextSelection(containerRef: React.RefObject<HTMLElement | null>): Selection | null {
  const [sel, setSel] = useState<Selection | null>(null);
  // Track whether the pointerdown that started this pointerup happened inside
  // the popover button. If so, we must NOT re-capture/clobber the existing
  // selection state — the user is clicking to ask, not making a new selection.
  const downInPopoverRef = useRef(false);

  useEffect(() => {
    function capture() {
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
      const rect = s.getRangeAt(0).getBoundingClientRect();
      setSel({
        text,
        messageId,
        rect: { top: rect.top, bottom: rect.bottom, left: rect.left + rect.width / 2 },
      });
    }

    function onPointerDown(e: PointerEvent) {
      const target = e.target as HTMLElement | null;
      downInPopoverRef.current = !!target?.closest('[data-selection-popover]');
    }
    function onPointerUp() {
      // If this pointerup belongs to a popover-button click, preserve current sel.
      if (downInPopoverRef.current) {
        downInPopoverRef.current = false;
        return;
      }
      capture();
    }
    function onKeyUp(e: KeyboardEvent) {
      if (SELECTION_KEYS.has(e.key)) capture();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setSel(null);
    }
    function onSelectionChange() {
      const s = window.getSelection();
      if (!s || s.isCollapsed) setSel(null);
    }
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('pointerup', onPointerUp);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('pointerup', onPointerUp);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('selectionchange', onSelectionChange);
    };
  }, [containerRef]);

  return sel;
}

interface PopoverProps {
  selection: Selection | null;
  onAsk: (snapshot: Selection) => void;
}

const EDGE_MARGIN = 8;

export function SelectionPopover({ selection, onAsk }: PopoverProps) {
  const ref = useRef<HTMLButtonElement>(null);
  // Remember the last selection key we fired onAsk for; subsequent clicks
  // on the same selection are ignored so the button can only create one
  // branch per selection.
  const lastFiredKeyRef = useRef<string | null>(null);

  // Clamp into the viewport once the real size is known. Positioning purely
  // from the selection rect put the button half off-screen for a selection near
  // an edge, and above the fold for one on the first line. This writes the
  // final position straight to the node during the layout phase — before paint,
  // and without a second render pass.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !selection) return;
    const { width, height } = el.getBoundingClientRect();
    const half = width / 2;
    const left = Math.min(
      Math.max(selection.rect.left, half + EDGE_MARGIN),
      Math.max(half + EDGE_MARGIN, window.innerWidth - half - EDGE_MARGIN),
    );
    const above = selection.rect.top - height - EDGE_MARGIN;
    el.style.left = `${left}px`;
    el.style.top = `${above < EDGE_MARGIN ? selection.rect.bottom + EDGE_MARGIN : above}px`;
  }, [selection]);

  if (!selection) return null;
  // Snapshot the selection at render time so the click handler is immune
  // to any state changes (e.g., selectionchange firing between pointerdown
  // and click on this button).
  const snapshot = selection;
  const key = `${snapshot.messageId}::${snapshot.text}`;
  const short =
    snapshot.text.length > 12 ? snapshot.text.slice(0, 12) + '…' : snapshot.text;
  return (
    <button
      ref={ref}
      type="button"
      data-selection-popover
      aria-label={`就选中的文本「${snapshot.text.slice(0, 40)}」创建追问分支`}
      onPointerDown={(e) => {
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
        // Provisional; the layout effect clamps these before paint.
        top: selection.rect.top - 40,
        left: selection.rect.left,
        transform: 'translateX(-50%)',
      }}
      className="z-50 rounded-full bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-lg hover:bg-blue-700"
    >
      💡 追问「{short}」
    </button>
  );
}
