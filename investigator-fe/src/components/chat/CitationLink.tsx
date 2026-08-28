"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Citation } from "@/types/chat";

type Props = {
  citation: Citation;
  githubUrl: string;
};

function buildGithubLink(githubUrl: string, citation: Citation): string {
  const base = githubUrl.replace(/\/$/, "");
  return `${base}/blob/HEAD/${citation.filePath}#L${citation.lineStart}-L${citation.lineEnd}`;
}

export function CitationLink({ citation, githubUrl }: Props) {
  const [showExcerpt, setShowExcerpt] = useState(false);
  const range = `${citation.filePath}:${citation.lineStart}-${citation.lineEnd}`;

  return (
    <div className="inline-block w-full">
      <div className="flex items-center gap-2 flex-wrap">
        <a
          href={buildGithubLink(githubUrl, citation)}
          target="_blank"
          rel="noopener noreferrer"
          className={cn( "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs font-mono transition-colors",
            citation.verified
              ? "border-border text-foreground-2 hover:border-border-strong"
              : "border-amber-300 text-amber-700 dark:border-amber-700 dark:text-amber-400",
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
            className="text-[11px] text-muted hover:text-foreground"
          >
            {showExcerpt ? "hide" : "preview"}
          </button>
        )}
      </div>
      {showExcerpt && citation.excerpt && (
        <pre className="mt-1.5 rounded-md border border-border bg-surface-2 p-2 text-[11px] font-mono overflow-x-auto whitespace-pre">
          {citation.excerpt}
        </pre>
      )}
    </div>
  );
}
