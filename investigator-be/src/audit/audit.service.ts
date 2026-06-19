import { Injectable, Logger } from '@nestjs/common';
import type { AuditStatus } from '@prisma/client';
import { CitationInput } from '@/agent/dto/agent-result.dto';
import { AuditChecker } from '@/audit/audit.checker';
import { AuditLlm } from '@/audit/audit.llm';
import { AuditResult } from '@/audit/dto/audit-result.dto';

const STATUS_RANK: Record<AuditStatus, number> = {
  trusted: 3,
  partial: 2,
  suspect: 1,
  pending: 0,
};

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly checker: AuditChecker,
    private readonly llm: AuditLlm,
  ) {}

  async run(input: {
    repoRoot: string;
    question: string;
    answer: string;
    citations: CitationInput[];
  }): Promise<AuditResult> {
    const programmatic = await this.checker.check(
      input.repoRoot,
      input.citations,
    );

    const llm = await this.llm.audit({
      question: input.question,
      answer: input.answer,
      programmatic,
    });

    // Final status = the worse of (programmatic implied status, llm status).
    // Programmatic translates to: pass -> can be anything, fail -> max "partial".
    const programmaticImplied: AuditStatus = programmatic.pass
      ? 'trusted'
      : 'partial';
    const status: AuditStatus =
      STATUS_RANK[programmaticImplied] < STATUS_RANK[llm.status]
        ? programmaticImplied
        : llm.status;

    return { status, programmatic, llm };
  }
}
