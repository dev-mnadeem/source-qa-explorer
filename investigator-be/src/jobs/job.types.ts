/**
 * Progress events emitted while an investigation runs.
 *
 * Persisted on the job row and streamed to the browser, so a client that
 * connects late — or reconnects after a dropped connection — can replay
 * everything that has happened so far rather than waiting blind.
 */
export type ProgressEvent =
  | { type: 'queued'; at: string }
  | { type: 'started'; at: string }
  | { type: 'turn'; at: string; turn: number }
  | { type: 'tool'; at: string; name: string; summary: string }
  | { type: 'answering'; at: string }
  | { type: 'auditing'; at: string }
  | { type: 'done'; at: string; messageId: string; verdict: string }
  | { type: 'error'; at: string; message: string };

export const nowIso = (): string => new Date().toISOString();
