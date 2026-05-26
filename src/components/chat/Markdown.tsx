'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { memo } from 'react';
import React from 'react';

export const Markdown = memo(function Markdown({ content }: { content: string }) {
  return (
    <div className="fy-md min-w-0 max-w-full break-words text-sm leading-relaxed text-gray-800">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="mb-3 mt-4 border-b border-gray-200 pb-1 text-2xl font-bold first:mt-0">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="mb-2 mt-4 border-b border-gray-100 pb-1 text-xl font-bold first:mt-0">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mb-2 mt-3 text-lg font-semibold first:mt-0">{children}</h3>
          ),
          h4: ({ children }) => (
            <h4 className="mb-1.5 mt-3 text-base font-semibold first:mt-0">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="mb-1 mt-2 text-sm font-semibold first:mt-0">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="mb-1 mt-2 text-xs font-semibold uppercase tracking-wide text-gray-600 first:mt-0">
              {children}
            </h6>
          ),
          p: ({ children }) => (
            <p className="my-2 break-words leading-relaxed first:mt-0 last:mb-0">{children}</p>
          ),
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer noopener"
              className="break-all text-blue-600 underline-offset-2 hover:underline"
            >
              {children}
            </a>
          ),
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          em: ({ children }) => <em className="italic">{children}</em>,
          ul: ({ children }) => (
            <ul className="my-2 list-disc space-y-1 pl-6 marker:text-gray-400">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 list-decimal space-y-1 pl-6 marker:text-gray-500">{children}</ol>
          ),
          li: ({ children }) => <li className="break-words leading-relaxed">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-gray-300 bg-gray-50 px-4 py-2 text-gray-700">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="my-4 border-gray-200" />,
          table: ({ children }) => (
            <div className="my-3 max-w-full overflow-x-auto rounded border border-gray-200">
              <table className="w-full border-collapse text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-gray-50">{children}</thead>,
          tbody: ({ children }) => (
            <tbody className="[&>tr:nth-child(even)]:bg-gray-50/60">{children}</tbody>
          ),
          tr: ({ children }) => <tr className="border-b border-gray-200 last:border-0">{children}</tr>,
          th: ({ children }) => (
            <th className="border-r border-gray-200 px-3 py-2 text-left font-semibold last:border-0">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-r border-gray-200 px-3 py-2 align-top last:border-0">{children}</td>
          ),
          pre: ({ children }) => {
            // Check if this is a fenced code block (has a code child with className)
            const codeChild = Array.isArray(children)
              ? children.find(
                  (c: React.ReactNode) => React.isValidElement(c) && c.type === 'code',
                )
              : React.isValidElement(children) && children.type === 'code'
                ? children
                : null;

            if (
              codeChild &&
              React.isValidElement(codeChild) &&
              (codeChild.props as { className?: string })?.className
            ) {
              // Fenced code block — pass through, code handler renders the styled block
              return <>{children}</>;
            }
            // Plain pre (ASCII diagrams etc.) — wrap with styling
            return (
              <pre className="my-3 max-w-full overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 p-3 font-mono text-[13px] leading-relaxed">
                {children}
              </pre>
            );
          },
          code(props) {
            const { className, children, ...rest } = props as {
              className?: string;
              children?: React.ReactNode;
            };
            const match = /language-(\w+)/.exec(className ?? '');
            const isBlock = !!match;
            if (isBlock) {
              const lang = match[1];
              return (
                <div className="my-3 max-w-full overflow-hidden rounded-lg border border-[#2a2a3e] bg-[#1e1e2e]">
                  <div className="flex items-center justify-between border-b border-[#2a2a3e] px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">
                    <span>{lang}</span>
                  </div>
                  <pre className="m-0 max-w-full overflow-x-auto bg-transparent p-3 text-[13px] leading-relaxed text-[#e2e8f0]">
                    <code className={`${className ?? ''} font-mono`} {...rest}>
                      {children}
                    </code>
                  </pre>
                </div>
              );
            }
            return (
              <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-[0.85em] text-pink-700">
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
