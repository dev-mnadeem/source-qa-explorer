export type ToolCallRecord = {
  name: string;
  input: Record<string, unknown>;
  resultSummary: string;
};

export type CitationInput = {
  filePath: string;
  lineStart: number;
  lineEnd: number;
};

import type { CostRecord } from '@/llm/llm.cost';

export type AgentResult = {
  answer: string;
  citations: CitationInput[];
  toolCalls: ToolCallRecord[];
  costs: CostRecord[];
  stopReason: 'submitted' | 'max_turns' | 'no_answer';
};
