"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Props = {
  children: string;
};

export function Markdown({ children }: Props) {
  return (
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
        code: ({ className, children: c }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <code className="block">
                {c}
              </code>
            );
          }
          return (
            <code className="rounded bg-zinc-200/70 dark:bg-zinc-800/70 px-1 py-0.5 font-mono text-[0.85em]">
              {c}
            </code>
          );
        },
        pre: ({ children: c }) => (
          <pre className="my-2 rounded-md bg-zinc-200/70 dark:bg-zinc-800/70 p-3 overflow-x-auto text-[12px] font-mono leading-relaxed">
            {c}
          </pre>
        ),
        blockquote: ({ children: c }) => (
          <blockquote className="my-2 border-l-2 border-zinc-300 dark:border-zinc-700 pl-3 italic text-zinc-600 dark:text-zinc-400">
            {c}
          </blockquote>
        ),
        hr: () => <hr className="my-3 border-zinc-200 dark:border-zinc-800" />,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
