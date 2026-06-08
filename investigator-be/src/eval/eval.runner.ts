import { Injectable, Logger } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { AgentService } from '@/agent/agent.service';
import { AuditService } from '@/audit/audit.service';
import { LLM_PROVIDER } from '@/llm/llm.types';
import type { LlmProvider } from '@/llm/llm.types';
import { CaseResult, EvalCase, EvalReport } from '@/eval/eval.types';

const VERDICT_RANK: Record<string, number> = {
  trusted: 3,
  partial: 2,
  suspect: 1,
  pending: 0,
};

/**
 * Scores the investigator against a fixture repository with known answers.
 *
 * Without this there is no way to tell whether a prompt edit, a model swap or a
 * change to the retrieval tools made the system better or worse — only whether
 * it still runs. The metrics that matter are retrieval quality (did it cite the
 * right files, and did those citations resolve) rather than prose similarity.
 */
@Injectable()
export class EvalRunner {
  private readonly logger = new Logger(EvalRunner.name);

  constructor(
    private readonly agent: AgentService,
    private readonly audit: AuditService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  async run(repoRoot: string, cases: EvalCase[]): Promise<EvalReport> {
    const startedAt = new Date().toISOString();
    const results: CaseResult[] = [];

    for (const testCase of cases) {
      results.push(await this.runCase(repoRoot, testCase));
    }

    const latencies = results
      .map((r) => r.metrics.latencyMs)
      .sort((a, b) => a - b);
    const passed = results.filter((r) => r.passed).length;
    const mean = (pick: (r: CaseResult) => number) =>
      results.length === 0
        ? 0
        : Number(
            (
              results.reduce((sum, r) => sum + pick(r), 0) / results.length
            ).toFixed(4),
          );

    return {
      startedAt,
      provider: this.llm.name,
      passed,
      failed: results.length - passed,
      total: results.length,
      passRate:
        results.length === 0 ? 0 : Number((passed / results.length).toFixed(4)),
      meanCitationRecall: mean((r) => r.metrics.citationRecall),
      meanCitationPrecision: mean((r) => r.metrics.citationPrecision),
      totalUsd: Number(
        results.reduce((sum, r) => sum + r.metrics.usd, 0).toFixed(6),
      ),
      p50LatencyMs: this.percentile(latencies, 0.5),
      p95LatencyMs: this.percentile(latencies, 0.95),
      cases: results,
    };
  }

  private async runCase(
    repoRoot: string,
    testCase: EvalCase,
  ): Promise<CaseResult> {
    const started = Date.now();
    const failures: string[] = [];

    const agentResult = await this.agent.investigate({
      repoRoot,
      repoLabel: 'eval/fixture',
      history: [],
      userMessage: testCase.question,
    });

    const audit = await this.audit.run({
      repoRoot,
      question: testCase.question,
      answer: agentResult.answer,
      citations: agentResult.citations,
      priorCosts: agentResult.costs,
    });

    const citedPaths = agentResult.citations.map((c) => c.filePath);

    // Recall: how many of the files we expected did it actually cite.
    const hits = testCase.expectCitedFiles.filter((expected) =>
      citedPaths.some((p) => p.includes(expected)),
    );
    const citationRecall =
      testCase.expectCitedFiles.length === 0
        ? 1
        : hits.length / testCase.expectCitedFiles.length;

    for (const expected of testCase.expectCitedFiles) {
      if (!citedPaths.some((p) => p.includes(expected))) {
        failures.push(
          `expected a citation to "${expected}", got [${citedPaths.join(', ') || 'none'}]`,
        );
      }
    }

    // Precision: how many of its citations survived verification.
    const verifiedCount = audit.programmatic.perCitation.filter(
      (c) => c.verified,
    ).length;
    const citationPrecision =
      agentResult.citations.length === 0
        ? 0
        : verifiedCount / agentResult.citations.length;

    for (const needle of testCase.expectAnswerContains ?? []) {
      if (!agentResult.answer.toLowerCase().includes(needle.toLowerCase())) {
        failures.push(`answer did not mention "${needle}"`);
      }
    }

    const minVerdict = testCase.minVerdict ?? 'partial';
    if (VERDICT_RANK[audit.status] < VERDICT_RANK[minVerdict]) {
      failures.push(
        `verdict was "${audit.status}", expected at least "${minVerdict}"`,
      );
    }

    return {
      id: testCase.id,
      question: testCase.question,
      passed: failures.length === 0,
      failures,
      metrics: {
        citationRecall: Number(citationRecall.toFixed(4)),
        citationPrecision: Number(citationPrecision.toFixed(4)),
        verdict: audit.status,
        toolCalls: agentResult.toolCalls.length,
        latencyMs: Date.now() - started,
        usd: audit.cost.usd,
      },
    };
  }

  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.min(
      sorted.length - 1,
      Math.max(0, Math.ceil(p * sorted.length) - 1),
    );
    return sorted[idx];
  }
}
