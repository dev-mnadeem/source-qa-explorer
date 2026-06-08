"use client";

import { useState } from "react";
import type { ToolCallRecord } from "@/types/chat";

type Props = {
  toolCalls: ToolCallRecord[];
};

export function ToolCallTrace({ toolCalls }: Props) {
  const [open, setOpen] = useState(false);

  if (toolCalls.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-muted hover:text-foreground inline-flex items-center gap-1"
      >
        <span>{open ? "▾" : "▸"}</span>
        Tool calls ({toolCalls.length})
      </button>
      {open && (
        <ol className="mt-2 space-y-1 text-[11px] font-mono text-foreground-2 border-l-2 border-border pl-3">
          {toolCalls.map((call, idx) => (
            <li key={idx}>
              <span className="text-muted mr-1">
                {idx + 1}.
              </span>
              {call.resultSummary}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
