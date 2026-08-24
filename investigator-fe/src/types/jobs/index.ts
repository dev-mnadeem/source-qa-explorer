export type ProgressEvent =
  | { type: "queued"; at: string }
  | { type: "started"; at: string }
  | { type: "turn"; at: string; turn: number }
  | { type: "tool"; at: string; name: string; summary: string }
  | { type: "answering"; at: string }
  | { type: "auditing"; at: string }
  | { type: "done"; at: string; messageId: string; verdict: string }
  | { type: "error"; at: string; message: string };

export type JobStatus = "queued" | "running" | "succeeded" | "failed";

export type Job = {
  id: string;
  sessionId: string;
  status: JobStatus;
  question: string;
  resultMessageId: string | null;
  error: string | null;
  events: ProgressEvent[];
  createdAt: string;
};
