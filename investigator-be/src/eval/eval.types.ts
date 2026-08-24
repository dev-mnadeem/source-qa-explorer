/**
 * A single scored question.
 *
 * The graders are deliberately deterministic. An LLM-as-judge would let the
 * thing under test grade its own homework, and would make the score move on
 * reruns for reasons unrelated to a change in the system.
 */
export type EvalCase = {
  id: string;
  question: string;
  /** Every one of these must appear somewhere in the cited file paths. */
  expectCitedFiles: string[];
  /** Case-insensitive substrings the answer text must contain. */
  expectAnswerContains?: string[];
  /** The verdict must be at least this trustworthy. */
  minVerdict?: 'trusted' | 'partial' | 'suspect';
};

export type CaseResult = {
  id: string;
  question: string;
  passed: boolean;
  failures: string[];
  metrics: {
    /** Fraction of expected files that were actually cited. */
    citationRecall: number;
    /** Fraction of cited ranges that resolved against the source. */
    citationPrecision: number;
    verdict: string;
    toolCalls: number;
    latencyMs: number;
    usd: number;
  };
};

export type EvalReport = {
  startedAt: string;
  provider: string;
  passed: number;
  failed: number;
  total: number;
  /** Share of cases that passed every assertion. */
  passRate: number;
  /** Mean over cases; the headline retrieval numbers. */
  meanCitationRecall: number;
  meanCitationPrecision: number;
  totalUsd: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  cases: CaseResult[];
};
