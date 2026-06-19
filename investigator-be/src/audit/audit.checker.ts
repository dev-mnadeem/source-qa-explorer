import { Injectable } from '@nestjs/common';
import { CodeService } from '@/code/code.service';
import { CitationInput } from '@/agent/dto/agent-result.dto';
import { ProgrammaticCheckResult } from '@/audit/dto/audit-result.dto';

@Injectable()
export class AuditChecker {
  constructor(private readonly codeService: CodeService) {}

  async check(
    repoRoot: string,
    citations: CitationInput[],
  ): Promise<ProgrammaticCheckResult> {
    if (citations.length === 0) {
      return {
        pass: false,
        notes: 'The answer was submitted without any citations.',
        perCitation: [],
      };
    }

    const perCitation: ProgrammaticCheckResult['perCitation'] = [];
    const failures: string[] = [];

    for (const citation of citations) {
      const result = await this.verifyOne(repoRoot, citation);
      perCitation.push(result);
      if (!result.verified) {
        failures.push(
          `${citation.filePath}:${citation.lineStart}-${citation.lineEnd} — ${result.reason ?? 'unverified'}`,
        );
      }
    }

    if (failures.length === 0) {
      return {
        pass: true,
        notes: `All ${citations.length} citation(s) verified against the source.`,
        perCitation,
      };
    }

    return {
      pass: false,
      notes: `${failures.length}/${citations.length} citation(s) failed verification:\n- ${failures.join('\n- ')}`,
      perCitation,
    };
  }

  private async verifyOne(
    repoRoot: string,
    citation: CitationInput,
  ): Promise<ProgrammaticCheckResult['perCitation'][number]> {
    if (
      !Number.isFinite(citation.lineStart) ||
      !Number.isFinite(citation.lineEnd) ||
      citation.lineStart < 1 ||
      citation.lineEnd < citation.lineStart
    ) {
      return {
        citation,
        verified: false,
        reason: `invalid line range (${citation.lineStart}-${citation.lineEnd})`,
      };
    }

    try {
      const file = await this.codeService.readFile(
        repoRoot,
        citation.filePath,
        citation.lineStart,
        citation.lineEnd,
      );
      // The cited range must be fully contained in the file.
      if (citation.lineEnd > file.totalLines) {
        return {
          citation,
          verified: false,
          reason: `line ${citation.lineEnd} exceeds file length (${file.totalLines})`,
        };
      }
      // Excerpt cannot be empty (e.g. citing whitespace-only block is meaningless).
      if (file.content.trim().length === 0) {
        return {
          citation,
          verified: false,
          reason: 'cited range is empty / whitespace-only',
          excerpt: file.content,
        };
      }
      return {
        citation,
        verified: true,
        excerpt: file.content,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return { citation, verified: false, reason: message };
    }
  }
}
