import type { AuditStatus } from '@prisma/client';
import { CitationInput } from '@/agent/dto/agent-result.dto';

export type ProgrammaticCheckResult = {
  pass: boolean;
  notes: string;
  /**
   * Citations annotated with whether each individually verified. Used to
   * persist a `verified` flag on the citation row.
   */
  perCitation: Array<{
    citation: CitationInput;
    verified: boolean;
    reason?: string;
    excerpt?: string;
  }>;
};

export type LlmAuditResult = {
  status: AuditStatus;
  reasons: string;
};

export type AuditResult = {
  status: AuditStatus;
  programmatic: ProgrammaticCheckResult;
  llm: LlmAuditResult;
};
