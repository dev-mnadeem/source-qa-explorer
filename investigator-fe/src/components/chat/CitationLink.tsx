"use client";

import { useState } from "react";
import { githubBlobUrl } from "@/lib/github";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types/chat";

type Props = {
  citation: Citation;
  githubUrl: string;
};

export function CitationLink({ citation, githubUrl }: Props) {
  const [showExcerpt, setShowExcerpt] = useState(false);
  const range = `${citation.filePath}:${citation.lineStart}-${citation.lineEnd}`;

  return (
    <div className="inline-block w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={githubBlobUrl(githubUrl, citation)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-xs break-all transition-colors",
            citation.verified
              ? "border-border text-foreground-2 hover:border-accent"
              : "border-partial/40 bg-partial-soft text-partial",
          )}
          title={citation.verified ? "Open on GitHub" : "Unverified citation"}
        >
          {range}
          {!citation.verified && (
            <span className="text-[10px] uppercase tracking-wider">unverified</span>
          )}
        </a>
        {citation.excerpt && (
          <button
            type="button"
            onClick={() => setShowExcerpt((v) => !v)}
            aria-expanded={showExcerpt}
            className="text-[11px] text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            {showExcerpt ? "hide" : "preview"}
          </button>
        )}
      </div>
      {showExcerpt && citation.excerpt && (
        <pre className="mt-1.5 overflow-x-auto rounded-md border border-border bg-surface p-2 font-mono text-[11px] whitespace-pre">
          {citation.excerpt}
        </pre>
      )}
    </div>
  );
}
