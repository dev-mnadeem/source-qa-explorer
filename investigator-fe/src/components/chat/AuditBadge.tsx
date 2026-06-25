"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { AuditVerdict } from "@/types/chat";

type Props = {
  verdict: AuditVerdict;
};

const STATUS_STYLES = {
  trusted: {
    label: "Trusted",
    className:
      "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
  },
  partial: {
    label: "Partial",
    className:
      "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  },
  suspect: {
    label: "Suspect",
    className:
      "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
  },
  pending: {
    label: "Pending",
    className:
      "bg-zinc-50 text-zinc-700 border-zinc-200 dark:bg-zinc-900/20 dark:text-zinc-300 dark:border-zinc-800",
  },
} as const;

export function AuditBadge({ verdict }: Props) {
  const [open, setOpen] = useState(false);
  const style = STATUS_STYLES[verdict.status];

  return (
    <div className="inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
          style.className,
        )}
        aria-expanded={open}
      >
        <span
          className={cn(
            "size-1.5 rounded-full",
            verdict.status === "trusted" && "bg-emerald-500",
            verdict.status === "partial" && "bg-amber-500",
            verdict.status === "suspect" && "bg-red-500",
            verdict.status === "pending" && "bg-zinc-500",
          )}
        />
        Audit: {style.label}
        <span className="text-[10px] opacity-60">{open ? "▴" : "▾"}</span>
      </button>
      {open && (
        <div className="mt-2 rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 text-xs space-y-2 max-w-xl">
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">
              Programmatic check{" "}
              <span
                className={cn(
                  "ml-1 font-normal",
                  verdict.programmaticPass
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-red-600 dark:text-red-400",
                )}
              >
                {verdict.programmaticPass ? "passed" : "failed"}
              </span>
            </div>
            {verdict.programmaticNotes && (
              <pre className="mt-1 whitespace-pre-wrap text-zinc-600 dark:text-zinc-400 font-mono text-[11px]">
                {verdict.programmaticNotes}
              </pre>
            )}
          </div>
          <div>
            <div className="font-semibold text-zinc-700 dark:text-zinc-300">
              LLM auditor{" "}
              <span className="ml-1 font-normal text-zinc-600 dark:text-zinc-400">
                ({verdict.llmStatus})
              </span>
            </div>
            <p className="mt-1 text-zinc-600 dark:text-zinc-400 leading-relaxed">
              {verdict.llmReasons}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
