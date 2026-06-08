"use client";

import type { ProgressEvent } from "@/types/jobs";

type Props = {
  events: ProgressEvent[];
};

const LABELS: Record<string, string> = {
  queued: "Queued",
  started: "Cloning and orienting",
  answering: "Composing the answer",
  auditing: "Auditing the answer",
};

/**
 * Shows the investigation as it happens.
 *
 * A multi-turn agent can take a while, and an undifferentiated spinner makes
 * that time feel broken. Naming each file it reads makes the same wait read as
 * work being done — and doubles as the clearest explanation of what the system
 * actually does.
 */
export function ProgressTrace({ events }: Props) {
  if (events.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
        </span>
        <span className="font-mono text-[11px] tracking-widest text-muted uppercase">
          Investigating
        </span>
      </div>

      <ol className="space-y-1">
        {events.map((event, i) => (
          <li
            key={`${event.type}-${i}`}
            className="flex gap-2 font-mono text-[12px] leading-relaxed text-foreground-2"
          >
            <span className="text-muted">
              {String(i + 1).padStart(2, "0")}
            </span>
            {event.type === "tool" ? (
              // The summary already opens with the tool name, so rendering the
              // name separately would print it twice.
              <span>
                <span className="text-accent">{event.name}</span>
                <span className="text-muted">
                  {event.summary.startsWith(event.name)
                    ? event.summary.slice(event.name.length)
                    : ` ${event.summary}`}
                </span>
              </span>
            ) : event.type === "turn" ? (
              <span className="text-muted">Turn {event.turn}</span>
            ) : event.type === "error" ? (
              <span className="text-suspect">{event.message}</span>
            ) : event.type === "done" ? (
              <span className="text-trusted">
                Done — verdict: {event.verdict}
              </span>
            ) : (
              <span className="text-muted">
                {LABELS[event.type] ?? event.type}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
