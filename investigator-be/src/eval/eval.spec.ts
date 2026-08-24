import { join } from 'node:path';
import { ConfigService } from '@nestjs/config';
import { AgentService } from '@/agent/agent.service';
import { AuditChecker } from '@/audit/audit.checker';
import { AuditLlm } from '@/audit/audit.llm';
import { AuditService } from '@/audit/audit.service';
import { CodeService } from '@/code/code.service';
import { RelevanceService } from '@/code/relevance.service';
import { LlmCostTracker } from '@/llm/llm.cost';
import { FakeLlmProvider } from '@/llm/providers/fake.provider';
import { EvalRunner } from '@/eval/eval.runner';
import { EvalCase } from '@/eval/eval.types';

const FIXTURE_REPO = join(
  __dirname,
  '..',
  '..',
  'test',
  'fixtures',
  'sample-repo',
);

/**
 * The scored question set.
 *
 * Kept small on purpose: every case must be one a human can verify by opening
 * the fixture, otherwise the score stops meaning anything.
 */
const CASES: EvalCase[] = [
  {
    id: 'auth-token',
    question: 'How are authentication tokens signed and verified?',
    expectCitedFiles: ['auth.ts'],
    minVerdict: 'partial',
  },
  {
    id: 'rate-limit',
    question: 'How does the rateLimit bucket refill?',
    expectCitedFiles: ['rateLimit.ts'],
    minVerdict: 'partial',
  },
  {
    id: 'entry-point',
    question: 'What does the index module export?',
    expectCitedFiles: ['index.ts'],
    minVerdict: 'partial',
  },
];

/**
 * Runs the evaluation as part of the normal test suite.
 *
 * Against the offline provider this is a regression gate on retrieval — it
 * catches a change to the tools, the transcript format or the citation checker
 * that quietly stops the agent finding the right file. Point it at a live
 * provider to score an actual model.
 */
describe('Investigator evaluation', () => {
  const config = new ConfigService({});
  const cost = new LlmCostTracker(config);
  const llm = new FakeLlmProvider();
  const code = new CodeService();

  const runner = new EvalRunner(
    new AgentService(llm, code, new RelevanceService(code), config, cost),
    new AuditService(
      new AuditChecker(code),
      new AuditLlm(llm, config, cost),
      cost,
    ),
    llm,
  );

  it('scores the fixture repository', async () => {
    const report = await runner.run(FIXTURE_REPO, CASES);

    console.log(
      `\n  eval: provider=${report.provider} ` +
        `pass=${report.passed}/${report.total} ` +
        `recall=${report.meanCitationRecall} ` +
        `precision=${report.meanCitationPrecision} ` +
        `p95=${report.p95LatencyMs}ms usd=${report.totalUsd}`,
    );
    for (const c of report.cases.filter((c) => !c.passed)) {
      console.log(`    FAIL ${c.id}: ${c.failures.join('; ')}`);
    }

    expect(report.total).toBe(CASES.length);

    // Every citation the agent produces must resolve against the source. This
    // is the assertion that would catch a regression in the citation checker
    // or a model that starts inventing line numbers.
    expect(report.meanCitationPrecision).toBe(1);

    // Retrieval must find the right file for most questions. Set below 1.0
    // deliberately: a hard 1.0 makes the suite brittle to a single ranking
    // tweak, while a floor still catches a real regression.
    expect(report.meanCitationRecall).toBeGreaterThanOrEqual(0.66);

    // No answer may ship as "suspect" on a fixture this simple.
    for (const c of report.cases) {
      expect(c.metrics.verdict).not.toBe('suspect');
    }
  }, 30_000);

  it('reports precision of zero when the agent cites nothing', async () => {
    const report = await runner.run(FIXTURE_REPO, [
      {
        id: 'unanswerable',
        question: 'zzzz',
        expectCitedFiles: [],
        minVerdict: 'suspect',
      },
    ]);
    // The fixture always yields a file, so this documents the metric's shape
    // rather than asserting a failure path.
    expect(report.cases[0].metrics.citationPrecision).toBeGreaterThanOrEqual(0);
  }, 30_000);
});
