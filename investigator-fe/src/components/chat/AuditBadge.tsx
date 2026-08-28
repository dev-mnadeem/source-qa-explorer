"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AuditVerdict } from "@/types/chat";

type Props = {
  verdict: AuditVerdict;
};

const STATUS_STYLES = {
  trusted: { label: "Trusted", className: "chip chip-trusted" },
  partial: { label: "Partial", className: "chip chip-partial" },
  suspect: { label: "Suspect", className: "chip chip-suspect" },
  pending: { label: "Pending", className: "chip chip-pending" },
} as const;

export function AuditBadge({ verdict }: Props) {
  const [open, setOpen] = useState(false);
  const style = STATUS_STYLES[verdict.status];

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(style.className, "cursor-pointer")}
        aria-expanded={open}
      >
        {/* The status dot is drawn by .chip::before, so none is needed here. */}
        Audit: {style.label}
        <span className="text-[10px] opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-border bg-surface p-3 text-xs space-y-2 max-w-xl">
          <div>
            <div className="font-semibold text-foreground-2">
              Programmatic check{" "}
              <span
                className={cn( "ml-1 font-normal",
                  verdict.programmaticPass
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {verdict.programmaticPass ? "passed" : "failed"}
              </span>
            </div>
            {verdict.programmaticNotes && (
              <pre className="mt-1 whitespace-pre-wrap text-foreground-2 font-mono text-[11px]">
                {verdict.programmaticNotes}
              </pre>
            )}
          </div>
          <div>
            <div className="font-semibold text-foreground-2">
              LLM auditor{" "}
              <span className="ml-1 font-normal text-foreground-2">
                ({verdict.llmStatus})
              </span>
            </div>
            <p className="mt-1 text-foreground-2 leading-relaxed">
              {verdict.llmReasons}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
