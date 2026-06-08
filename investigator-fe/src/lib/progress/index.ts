import type { ProgressEvent } from "@/types/jobs";

const STAGE_LABELS: Record<string, string> = {
  queued: "Queued",
  started: "Orienting in the checkout",
  answering: "Composing the answer",
  auditing: "Auditing the answer",
};

export type EventLine = {
  /** Highlighted lead, e.g. the tool name. */
  lead?: string;
  text: string;
  tone: "muted" | "error" | "success";
};

/** One line of the live investigation trace. */
export function describeEvent(event: ProgressEvent): EventLine {
  switch (event.type) {
    case "tool": {
      // Summaries open with the tool name; printing both would repeat it.
      const rest = event.summary.startsWith(event.name)
        ? event.summary.slice(event.name.length)
        : ` ${event.summary}`;
      return { lead: event.name, text: rest, tone: "muted" };
    }
    case "turn":
      return { text: `Turn ${event.turn}`, tone: "muted" };
    case "error":
      return { text: event.message, tone: "error" };
    case "done":
      return { text: `Done, verdict: ${event.verdict}`, tone: "success" };
    default:
      return { text: STAGE_LABELS[event.type] ?? event.type, tone: "muted" };
  }
}
