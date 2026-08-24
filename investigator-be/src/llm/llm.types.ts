import type Anthropic from '@anthropic-ai/sdk';

/**
 * The narrow slice of the Anthropic Messages API this app actually uses.
 *
 * Every LLM call in the codebase goes through this interface rather than a
 * concrete SDK class. That buys three things:
 *   1. the agent and auditor can be unit-tested with no network and no creds;
 *   2. the app boots and demos with zero API keys (see FakeLlmProvider);
 *   3. swapping Bedrock for direct Anthropic, or adding a new vendor, is a
 *      new file in providers/ plus one line in llm.module.ts.
 */
export interface LlmCompletionRequest {
  model: string;
  maxTokens: number;
  system: string;
  messages: Anthropic.MessageParam[];
  tools?: Anthropic.Tool[];
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface LlmCompletionResponse {
  content: Anthropic.ContentBlock[];
  stopReason: string | null;
  usage: LlmUsage;
}

export interface LlmProvider {
  /** Stable id used in logs and cost records, e.g. "bedrock" or "fake". */
  readonly name: string;
  /** True when the provider talks to a real, billable API. */
  readonly isLive: boolean;
  complete(request: LlmCompletionRequest): Promise<LlmCompletionResponse>;
}

export const LLM_PROVIDER = Symbol('LLM_PROVIDER');
