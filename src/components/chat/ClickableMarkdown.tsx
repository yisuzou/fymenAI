'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { tokenizeForClicking } from '@/lib/utils/tokenize';
import { memo } from 'react';

interface Props { content: string; onWordClick: (word: string) => void; }

function renderClickable(text: string, onClick: (w: string) => void) {
  return tokenizeForClicking(text).map((t, i) =>
    t.clickable ? (
      <span
        key={i}
        className="cursor-pointer rounded px-0.5 transition-colors hover:bg-yellow-200"
        onClick={(e) => { e.stopPropagation(); onClick(t.text); }}
      >{t.text}</span>
    ) : <span key={i}>{t.text}</span>
  );
}

export const ClickableMarkdown = memo(function ClickableMarkdown({ content, onWordClick }: Props) {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{wrap(children, onWordClick)}</p>,
          li: ({ children }) => <li>{wrap(children, onWordClick)}</li>,
          strong: ({ children }) => <strong>{wrap(children, onWordClick)}</strong>,
          em: ({ children }) => <em>{wrap(children, onWordClick)}</em>,
          code: (props: any) => props.inline
            ? <code className="rounded bg-gray-100 px-1">{props.children}</code>
            : <code>{props.children}</code>,
        }}
      >{content}</ReactMarkdown>
    </div>
  );
});

function wrap(children: React.ReactNode, onClick: (w: string) => void): React.ReactNode {
  if (typeof children === 'string') return renderClickable(children, onClick);
  if (Array.isArray(children)) return children.map((c, i) =>
    typeof c === 'string' ? <span key={i}>{renderClickable(c, onClick)}</span> : c);
  return children;
}
