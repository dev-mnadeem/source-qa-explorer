"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  children: string;
};

export function Markdown({ children }: Props) {
  return (
    <div className="answer">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children: c }) => (
            <h1 className="text-base font-semibold mt-3 mb-2">{c}</h1>
          ),
          h2: ({ children: c }) => (
            <h2 className="text-sm font-semibold mt-3 mb-1.5">{c}</h2>
          ),
          h3: ({ children: c }) => (
            <h3 className="text-sm font-semibold mt-2 mb-1">{c}</h3>
          ),
          p: ({ children: c }) => (
            <p className="my-2 leading-relaxed">{c}</p>
          ),
          ul: ({ children: c }) => (
            <ul className="my-2 list-disc pl-5 space-y-1">{c}</ul>
          ),
          ol: ({ children: c }) => (
            <ol className="my-2 list-decimal pl-5 space-y-1">{c}</ol>
          ),
          li: ({ children: c }) => <li className="leading-relaxed">{c}</li>,
          strong: ({ children: c }) => (
            <strong className="font-semibold">{c}</strong>
          ),
          em: ({ children: c }) => <em className="italic">{c}</em>,
          a: ({ children: c, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:no-underline"
            >
              {c}
            </a>
          ),
          code: ({ children: c }) => (
            <code className="rounded bg-surface px-1 py-0.5 font-mono text-[0.85em]">
              {c}
            </code>
          ),
          pre: ({ children: c }) => (
            <pre className="my-2 overflow-x-auto rounded-md border border-border bg-surface p-3 font-mono text-[12px] leading-relaxed">
              {c}
            </pre>
          ),
          blockquote: ({ children: c }) => (
            <blockquote className="my-2 border-l-2 border-border-strong pl-3 italic text-foreground-2">
              {c}
            </blockquote>
          ),
          hr: () => <hr className="my-3 border-border" />,
        }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
