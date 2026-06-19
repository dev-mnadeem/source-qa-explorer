import { AnthropicBedrock } from '@anthropic-ai/bedrock-sdk';
import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuditStatus } from '@prisma/client';
import { DEFAULT_BEDROCK_MODEL_ID, Provides } from '@/shared/constants';
import {
  AUDITOR_SYSTEM_PROMPT,
  buildAuditorUserPrompt,
} from '@/audit/audit.prompt';
import {
  LlmAuditResult,
  ProgrammaticCheckResult,
} from '@/audit/dto/audit-result.dto';

const VALID_STATUSES = new Set<AuditStatus>(['trusted', 'partial', 'suspect']);

@Injectable()
export class AuditLlm {
  private readonly logger = new Logger(AuditLlm.name);

  constructor(
    @Inject(Provides.Anthropic) private readonly anthropic: AnthropicBedrock,
    private readonly config: ConfigService,
  ) {}

  async audit(input: {
    question: string;
    answer: string;
    programmatic: ProgrammaticCheckResult;
  }): Promise<LlmAuditResult> {
    const citedExcerpts = input.programmatic.perCitation.map((row) => ({
      filePath: row.citation.filePath,
      lineStart: row.citation.lineStart,
      lineEnd: row.citation.lineEnd,
      excerpt: row.excerpt,
      verified: row.verified,
      reason: row.reason,
    }));

    const userPrompt = buildAuditorUserPrompt({
      question: input.question,
      answer: input.answer,
      citedExcerpts,
      programmatic: input.programmatic,
    });

    const model =
      this.config.get<string>('AWS_BEDROCK_AUDITOR_MODEL_ID') ??
      this.config.get<string>('AWS_BEDROCK_MODEL_ID') ??
      DEFAULT_BEDROCK_MODEL_ID;

    let raw = '';
    try {
      const response = await this.anthropic.messages.create({
        model,
        max_tokens: 600,
        system: AUDITOR_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      });
      raw = response.content
        .filter(
          (block): block is Anthropic.TextBlock => block.type === 'text',
        )
        .map((block) => block.text)
        .join('')
        .trim();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`LLM auditor call failed: ${message}`);
      return {
        status: 'suspect',
        reasons: `Auditor call failed (${message}). Treating as suspect.`,
      };
    }

    return this.parseVerdict(raw);
  }

  private parseVerdict(raw: string): LlmAuditResult {
    // Strip any markdown fencing and find the first {...} block.
    const cleaned = raw.replace(/```json\s*|```/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return {
        status: 'suspect',
        reasons: `Auditor returned non-JSON output. Treating as suspect.\nRaw: ${raw.slice(0, 300)}`,
      };
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]) as {
        status?: string;
        reasons?: string;
      };
      const status: AuditStatus = VALID_STATUSES.has(
        parsed.status as AuditStatus,
      )
        ? (parsed.status as AuditStatus)
        : 'suspect';
      return {
        status,
        reasons: parsed.reasons?.trim() || 'No reasons provided.',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'parse error';
      return {
        status: 'suspect',
        reasons: `Auditor JSON failed to parse (${message}).`,
      };
    }
  }
}
