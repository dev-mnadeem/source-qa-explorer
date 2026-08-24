import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmUsage } from '@/llm/llm.types';

/**
 * Per-million-token prices in USD. Sonnet-class defaults; override per
 * deployment with LLM_PRICE_INPUT_PER_MTOK / LLM_PRICE_OUTPUT_PER_MTOK
 * rather than editing code, since vendor pricing moves.
 */
const DEFAULT_INPUT_PRICE_PER_MTOK = 3.0;
const DEFAULT_OUTPUT_PRICE_PER_MTOK = 15.0;

export type CostRecord = {
  stage: 'investigator' | 'auditor';
  model: string;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

export type CostSummary = {
  inputTokens: number;
  outputTokens: number;
  usd: number;
  calls: number;
  byStage: Record<string, { calls: number; usd: number }>;
};

/**
 * Accumulates token usage for one investigation so the cost of answering a
 * single question can be reported alongside the answer.
 *
 * An LLM feature whose spend nobody measures is a liability in production;
 * surfacing per-request cost is the cheapest guard against that.
 */
@Injectable()
export class LlmCostTracker {
  private readonly logger = new Logger(LlmCostTracker.name);
  private readonly inputPrice: number;
  private readonly outputPrice: number;

  constructor(config: ConfigService) {
    this.inputPrice =
      config.get<number>('LLM_PRICE_INPUT_PER_MTOK') ??
      DEFAULT_INPUT_PRICE_PER_MTOK;
    this.outputPrice =
      config.get<number>('LLM_PRICE_OUTPUT_PER_MTOK') ??
      DEFAULT_OUTPUT_PRICE_PER_MTOK;
  }

  price(usage: LlmUsage): number {
    const input = (usage.inputTokens / 1_000_000) * this.inputPrice;
    const output = (usage.outputTokens / 1_000_000) * this.outputPrice;
    return Number((input + output).toFixed(6));
  }

  record(
    stage: CostRecord['stage'],
    model: string,
    usage: LlmUsage,
  ): CostRecord {
    return {
      stage,
      model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      usd: this.price(usage),
    };
  }

  summarise(records: CostRecord[]): CostSummary {
    const byStage: CostSummary['byStage'] = {};
    let inputTokens = 0;
    let outputTokens = 0;
    let usd = 0;

    for (const record of records) {
      inputTokens += record.inputTokens;
      outputTokens += record.outputTokens;
      usd += record.usd;
      const bucket = (byStage[record.stage] ??= { calls: 0, usd: 0 });
      bucket.calls += 1;
      bucket.usd = Number((bucket.usd + record.usd).toFixed(6));
    }

    return {
      inputTokens,
      outputTokens,
      usd: Number(usd.toFixed(6)),
      calls: records.length,
      byStage,
    };
  }
}
