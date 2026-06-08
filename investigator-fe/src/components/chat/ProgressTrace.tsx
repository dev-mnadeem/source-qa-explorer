"use client";

import { cn } from "@/lib/utils";
import { describeEvent } from "@/lib/progress";
import type { ProgressEvent } from "@/types/jobs";

type Props = {
  events: ProgressEvent[];
};

const TONES = {
  muted: "text-muted",
  error: "text-suspect",
  success: "text-trusted",
} as const;

/**
 * Shows the investigation as it happens.
 *
 * A multi-turn agent can take a while, and an undifferentiated spinner makes
 * that time feel broken. Naming each file it reads makes the same wait read as
 * work being done, and doubles as the clearest explanation of what the system
 * actually does.
 */
export function ProgressTrace({ events }: Props) {
  return (
    <section
      aria-label="Investigation progress"
      className="rounded-lg border border-border bg-surface p-3"
    >
      <div className="mb-2 flex items-center gap-2">
        <span aria-hidden className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="font-mono text-[11px] tracking-widest text-muted uppercase">
          Investigating
        </span>
      </div>

      {events.length === 0 ? (
        <p className="font-mono text-[12px] text-muted">Waiting for a worker…</p>
      ) : (
        <ol aria-live="polite" className="space-y-1">
          {events.map((event, i) => {
            const line = describeEvent(event);
            return (
              <li
                key={`${event.type}-${i}`}
                className="flex gap-2 font-mono text-[12px] leading-relaxed text-foreground-2"
              >
                <span aria-hidden className="text-muted">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 break-words">
                  {line.lead && <span className="text-accent">{line.lead}</span>}
                  <span className={cn(TONES[line.tone])}>{line.text}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
