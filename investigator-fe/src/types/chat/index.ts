export type AuditStatus = "trusted" | "partial" | "suspect" | "pending";

export type Citation = {
  id: string;
  filePath: string;
  lineStart: number;
  lineEnd: number;
  excerpt: string | null;
  verified: boolean;
};

export type AuditVerdict = {
  status: AuditStatus;
  programmaticPass: boolean;
  programmaticNotes: string | null;
  llmStatus: AuditStatus;
  llmReasons: string;
};

export type ToolCallRecord = {
  name: string;
  input: Record<string, unknown>;
  resultSummary: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[];
  auditVerdict: AuditVerdict | null;
  toolCalls: ToolCallRecord[] | null;
  createdAt: string;
};

export type SendMessageInput = {
  content: string;
};
