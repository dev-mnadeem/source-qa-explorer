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

export type AgentResult = {
  answer: string;
  citations: CitationInput[];
  toolCalls: ToolCallRecord[];
  stopReason: 'submitted' | 'max_turns' | 'no_answer';
};
