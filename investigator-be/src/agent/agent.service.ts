import type Anthropic from '@anthropic-ai/sdk';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CodeService } from '@/code/code.service';
import { RelevanceService } from '@/code/relevance.service';
import type { LlmProvider } from '@/llm/llm.types';
import { LLM_PROVIDER } from '@/llm/llm.types';
import { CostRecord, LlmCostTracker } from '@/llm/llm.cost';
import {
  DEFAULT_BEDROCK_MODEL_ID,
  MAX_TURNS_PER_INVESTIGATION,
} from '@/shared/constants';
import { AGENT_TOOLS } from '@/agent/agent.tools';
import { buildInvestigatorSystemPrompt } from '@/agent/agent.prompt';
import {
  AgentResult,
  CitationInput,
  ToolCallRecord,
} from '@/agent/dto/agent-result.dto';

type AnthropicMessageParam = Anthropic.MessageParam;

export type InvestigateInput = {
  repoRoot: string;
  repoLabel: string;
  history: AnthropicMessageParam[];
  userMessage: string;
  /**
   * Called as the loop advances. Optional so the agent stays usable from tests
   * and scripts that do not care about progress; when supplied it is what makes
   * the UI able to show the investigation happening rather than a spinner.
   */
  onProgress?: (event: AgentProgress) => void;
};

export type AgentProgress =
  | { kind: 'turn'; turn: number }
  | { kind: 'tool'; name: string; summary: string }
  | { kind: 'answering' }
  /** Emitted by the orchestrator once the agent has submitted. */
  | { kind: 'auditing' };

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
    private readonly codeService: CodeService,
    private readonly relevance: RelevanceService,
    private readonly config: ConfigService,
    private readonly cost: LlmCostTracker,
  ) {}

  async investigate(input: InvestigateInput): Promise<AgentResult> {
    const messages: AnthropicMessageParam[] = [
      ...input.history,
      { role: 'user', content: input.userMessage },
    ];
    const toolCalls: ToolCallRecord[] = [];
    const costs: CostRecord[] = [];
    const model =
      this.config.get<string>('AWS_BEDROCK_INVESTIGATOR_MODEL_ID') ??
      this.config.get<string>('AWS_BEDROCK_MODEL_ID') ??
      DEFAULT_BEDROCK_MODEL_ID;

    for (let turn = 0; turn < MAX_TURNS_PER_INVESTIGATION; turn++) {
      input.onProgress?.({ kind: 'turn', turn: turn + 1 });

      const response = await this.llm.complete({
        model,
        maxTokens: 4096,
        system: buildInvestigatorSystemPrompt(input.repoLabel),
        tools: AGENT_TOOLS,
        messages,
      });
      costs.push(this.cost.record('investigator', model, response.usage));

      // Persist the assistant's full response (text + tool_use blocks) to the
      // history so the next turn sees its own prior reasoning.
      messages.push({ role: 'assistant', content: response.content });

      // Look for a submit_answer terminal call first — if present, we're done.
      const submission = response.content.find(
        (block): block is Anthropic.ToolUseBlock =>
          block.type === 'tool_use' && block.name === 'submit_answer',
      );
      if (submission) {
        input.onProgress?.({ kind: 'answering' });
        return this.parseSubmission(submission, toolCalls, costs);
      }

      // Otherwise, dispatch any tool calls and feed results back.
      const toolUses = response.content.filter(
        (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
      );

      if (toolUses.length === 0) {
        // Model produced text but didn't submit. Nudge it once.
        if (response.stopReason === 'end_turn') {
          return {
            answer: this.collectText(response.content),
            citations: [],
            toolCalls,
            costs,
            stopReason: 'no_answer',
          };
        }
        // Otherwise, give it a chance to recover.
        messages.push({
          role: 'user',
          content:
            'Use the tools to investigate, then call submit_answer with citations.',
        });
        continue;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];
      for (const toolUse of toolUses) {
        const { content, summary } = await this.runTool(
          toolUse,
          input.repoRoot,
        );
        toolCalls.push({
          name: toolUse.name,
          input: toolUse.input as Record<string, unknown>,
          resultSummary: summary,
        });
        input.onProgress?.({ kind: 'tool', name: toolUse.name, summary });
        toolResults.push({
          type: 'tool_result',
          tool_use_id: toolUse.id,
          content,
        });
      }
      messages.push({ role: 'user', content: toolResults });
    }

    return {
      answer:
        'I ran out of investigation turns before reaching a confident answer. Please ask a more focused follow-up.',
      citations: [],
      toolCalls,
      costs,
      stopReason: 'max_turns',
    };
  }

  // ------------------------------------------------------------------

  private parseSubmission(
    submission: Anthropic.ToolUseBlock,
    toolCalls: ToolCallRecord[],
    costs: CostRecord[],
  ): AgentResult {
    const input = submission.input as {
      answer?: string;
      citations?: Array<{
        file_path?: string;
        line_start?: number;
        line_end?: number;
      }>;
    };
    const answer = input.answer?.trim() ?? '';
    const citations: CitationInput[] = (input.citations ?? [])
      .filter(
        (c): c is { file_path: string; line_start: number; line_end: number } =>
          typeof c.file_path === 'string' &&
          typeof c.line_start === 'number' &&
          typeof c.line_end === 'number',
      )
      .map((c) => ({
        filePath: c.file_path,
        lineStart: c.line_start,
        lineEnd: c.line_end,
      }));
    return { answer, citations, toolCalls, costs, stopReason: 'submitted' };
  }

  private collectText(content: Anthropic.ContentBlock[]): string {
    return content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
  }

  private async runTool(
    toolUse: Anthropic.ToolUseBlock,
    repoRoot: string,
  ): Promise<{ content: string; summary: string }> {
    try {
      const args = toolUse.input as Record<string, unknown>;
      switch (toolUse.name) {
        case 'list_dir': {
          const path = (args.path as string) ?? '.';
          const result = await this.codeService.listDir(repoRoot, path);
          const formatted = result.entries
            .map((e) => `${e.type === 'dir' ? 'd' : 'f'} ${e.name}`)
            .join('\n');
          return {
            content: `Listing of ${result.path}:\n${formatted || '(empty)'}`,
            summary: `list_dir(${path}) → ${result.entries.length} entries`,
          };
        }
        case 'read_file': {
          const path = args.path as string;
          const lineStart = args.line_start as number | undefined;
          const lineEnd = args.line_end as number | undefined;
          const result = await this.codeService.readFile(
            repoRoot,
            path,
            lineStart,
            lineEnd,
          );
          const numbered = result.content
            .split('\n')
            .map((line, idx) => `${result.startLine + idx}: ${line}`)
            .join('\n');
          const truncatedNote = result.truncated
            ? '\n[file was truncated to fit byte limit]'
            : '';
          return {
            content: `${path} (lines ${result.startLine}-${result.endLine} of ${result.totalLines}):\n${numbered}${truncatedNote}`,
            summary: `read_file(${path}, ${result.startLine}-${result.endLine})`,
          };
        }
        case 'grep': {
          const pattern = args.pattern as string;
          const glob = args.glob as string | undefined;
          const caseInsensitive = args.case_insensitive as boolean | undefined;
          const result = await this.codeService.grep(repoRoot, pattern, {
            glob,
            caseInsensitive,
          });
          const formatted = result.matches
            .map((m) => `${m.path}:${m.line}: ${m.text.slice(0, 200)}`)
            .join('\n');
          const trunc = result.truncated ? '\n[truncated]' : '';
          return {
            content: `grep ${pattern}${glob ? ` (glob: ${glob})` : ''}: ${result.matches.length} matches\n${formatted || '(no matches)'}${trunc}`,
            summary: `grep(${pattern}) → ${result.matches.length} matches`,
          };
        }
        case 'search_code': {
          const query = args.query as string;
          const limit = (args.limit as number | undefined) ?? 10;
          const ranked = await this.relevance.rank(repoRoot, query, limit);
          const formatted = ranked
            .map(
              (r) =>
                `${r.path} (score ${r.score})` +
                (r.bestLine
                  ? `\n    ${r.bestLine.line}: ${r.bestLine.text}`
                  : ''),
            )
            .join('\n');
          return {
            content: `search_code "${query}": ${ranked.length} ranked files\n${formatted || '(no matches)'}`,
            summary: `search_code(${query}) → ${ranked.length} ranked files`,
          };
        }
        case 'find_files': {
          const pattern = args.pattern as string;
          const result = await this.codeService.findFiles(repoRoot, pattern);
          const trunc = result.truncated ? '\n[truncated]' : '';
          return {
            content: `find_files ${pattern}: ${result.paths.length} matches\n${result.paths.join('\n') || '(no matches)'}${trunc}`,
            summary: `find_files(${pattern}) → ${result.paths.length} files`,
          };
        }
        default:
          return {
            content: `Unknown tool: ${toolUse.name}`,
            summary: `unknown(${toolUse.name})`,
          };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Tool ${toolUse.name} failed: ${message}`);
      return {
        content: `Error running ${toolUse.name}: ${message}`,
        summary: `${toolUse.name} → error: ${message}`,
      };
    }
  }
}
