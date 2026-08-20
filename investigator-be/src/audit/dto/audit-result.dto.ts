import type { AuditStatus } from '@prisma/client';
import { CitationInput } from '@/agent/dto/agent-result.dto';
import type { CostRecord, CostSummary } from '@/llm/llm.cost';

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
  costs: CostRecord[];
};

export type AuditResult = {
  status: AuditStatus;
  programmatic: ProgrammaticCheckResult;
  llm: LlmAuditResult;
  cost: CostSummary;
};
