import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
} from '@/llm/llm.types';

/** Give up searching after this many attempts and answer with what we have. */
const SEARCH_PATTERNS_MAX = 3;

/**
 * Offline provider used when no cloud credentials are configured.
 *
 * This is deliberately more than a stub that returns "hello". It walks the
 * repository through the same tool loop the real agent uses, reads the tool
 * results that come back, and builds its answer out of paths and line numbers
 * it actually observed. The consequence is that its citations point at real
 * lines in the real checkout, so the programmatic auditor genuinely verifies
 * them rather than rubber-stamping a canned response.
 *
 * That property is what makes this useful in CI and in a live demo: the whole
 * pipeline — agent loop, tool dispatch, citation verification, audit verdict —
 * is exercised end to end with no network and no spend.
 */
@Injectable()
export class FakeLlmProvider implements LlmProvider {
  readonly name = 'fake';
  readonly isLive = false;

  private readonly logger = new Logger(FakeLlmProvider.name);
  private readonly delayMs: number;

  /**
   * `FAKE_LLM_DELAY_MS` adds artificial latency per call.
   *
   * Offline calls return in under a millisecond, which makes a demo look like
   * nothing happened — the progress stream flashes past before it can be read.
   * A small delay restores the pacing of a real investigation. Zero by default
   * so tests and CI stay fast.
   */
  constructor(config?: ConfigService) {
    this.delayMs = Number(config?.get('FAKE_LLM_DELAY_MS') ?? 0);
  }

  async complete(
    request: LlmCompletionRequest,
  ): Promise<LlmCompletionResponse> {
    // The auditor calls without tools and expects a JSON verdict back.
    const isAuditorCall = !request.tools || request.tools.length === 0;
    const content = isAuditorCall
      ? this.auditVerdict(request)
      : this.investigatorTurn(request);

    if (this.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    }

    return {
      content,
      stopReason: 'tool_use',
      usage: { inputTokens: 0, outputTokens: 0 },
    };
  }

  // -- investigator ----------------------------------------------------

  /**
   * Chooses the next tool from what has actually been observed, rather than
   * from a turn counter.
   *
   * The distinction matters. A counter-driven version assumed the first search
   * would hit, so when a question's keyword matched no filenames it burned its
   * one search on a retry and then submitted with nothing read — producing an
   * uncited answer that the auditor correctly rejected. Branching on
   * observations instead means a failed search simply broadens and the loop
   * still reaches a file.
   */
  private investigatorTurn(
    request: LlmCompletionRequest,
  ): Anthropic.ContentBlock[] {
    const observed = this.readObservations(request.messages);
    const question = this.latestQuestion(request.messages);

    // 1. Orient: always start from the repository root.
    if (!observed.listedRoot) {
      return this.toolUse('list_dir', { path: '.' });
    }

    // 2. Rank the repository against the question. search_code understands
    //    that "authentication" should surface auth.ts, which the older
    //    filename-substring search could not.
    if (observed.rankedPaths.length === 0 && observed.searchCount === 0) {
      return this.toolUse('search_code', { query: question, limit: 8 });
    }

    // 3. Fall back to filename matching only if ranking found nothing.
    if (
      observed.candidatePaths.length === 0 &&
      observed.rankedPaths.length === 0 &&
      observed.searchCount < SEARCH_PATTERNS_MAX
    ) {
      return this.toolUse('find_files', {
        pattern: this.searchPattern(
          question,
          observed.dirEntries,
          observed.searchCount - 1,
        ),
      });
    }

    // 4. Read the best candidate so the answer can cite real lines. A ranked
    //    result already reflects relevance, so it is taken in order.
    const pool =
      observed.rankedPaths.length > 0
        ? observed.rankedPaths
        : observed.candidatePaths;
    if (!observed.lastReadFile && pool.length > 0) {
      const target =
        observed.rankedPaths.length > 0
          ? observed.rankedPaths[0]
          : this.bestCandidate(question, pool);
      return this.toolUse('read_file', {
        path: target,
        line_start: 1,
        line_end: 40,
      });
    }

    // 5. Answer — with citations if a file was read, honestly without if not.
    return this.submitAnswer(question, observed);
  }

  /**
   * Search patterns, tried in order until one matches:
   *   0. the most distinctive word in the question;
   *   1. a source directory seen in the root listing;
   *   2. "." — matches every path with an extension, i.e. everything.
   *
   * Step 2 guarantees the loop always finds something in a non-empty repo.
   */
  private searchPattern(
    question: string,
    dirEntries: string[],
    attempt: number,
  ): string {
    if (attempt === 0) {
      const keyword = this.keywordFor(question, dirEntries);
      if (keyword) return keyword;
    }
    if (attempt <= 1) {
      const dir = dirEntries.find((d) =>
        ['src', 'app', 'lib', 'source'].includes(d),
      );
      if (dir) return dir;
    }
    return '.';
  }

  /**
   * Picks the file most likely to answer the question.
   *
   * Source is preferred over documentation throughout: a README is often the
   * shortest path in a repository, so ranking on path length alone reliably
   * cites prose about the code instead of the code itself.
   */
  private bestCandidate(question: string, paths: string[]): string {
    const code = paths.filter((p) => !this.isDocument(p));
    const pool = code.length > 0 ? code : paths;

    const keyword = this.keywordFor(question, []);
    if (keyword) {
      const byKeyword = pool.find((p) => p.toLowerCase().includes(keyword));
      if (byKeyword) return byKeyword;
    }

    const entryPoint = pool.find((p) =>
      /(^|\/)(index|main|app|server)\.[a-z]+$/i.test(p),
    );
    if (entryPoint) return entryPoint;

    // Otherwise the shallowest file, which tends to be the more central one.
    return [...pool].sort(
      (a, b) =>
        a.split('/').length - b.split('/').length || a.length - b.length,
    )[0];
  }

  private isDocument(path: string): boolean {
    return /\.(md|mdx|markdown|txt|json|ya?ml|toml)$/i.test(path);
  }

  private submitAnswer(
    question: string,
    observed: Observations,
  ): Anthropic.ContentBlock[] {
    const file = observed.lastReadFile;

    if (!file) {
      return this.toolUse('submit_answer', {
        answer:
          'I could not find a file in this repository that answers that question. ' +
          'Try naming a specific module, symbol, or filename.',
        citations: [],
      });
    }

    // Cite a range we know exists: bounded by the lines actually returned.
    const lineStart = file.startLine;
    const lineEnd = Math.min(file.endLine, file.startLine + 19);

    const answer = [
      `**Offline demo answer.** No LLM credentials are configured, so this response`,
      `comes from the built-in fake provider — but the investigation itself was real:`,
      `the agent listed the repository, searched it, and read \`${file.path}\`.`,
      '',
      `Regarding *"${question}"* — the most relevant file found is`,
      `\`${file.path}\` (${file.totalLines} lines). Lines ${lineStart}–${lineEnd} are`,
      `cited below and have been verified against the checkout by the programmatic`,
      `auditor, exactly as they would be for a live model.`,
      '',
      `Set \`AWS_ACCESS_KEY_ID\`, \`AWS_SECRET_ACCESS_KEY\` and \`AWS_REGION\` to`,
      `swap in the real Bedrock-hosted model. Nothing else changes.`,
    ].join('\n');

    return this.toolUse('submit_answer', {
      answer,
      citations: [
        { file_path: file.path, line_start: lineStart, line_end: lineEnd },
      ],
    });
  }

  // -- auditor ---------------------------------------------------------

  private auditVerdict(
    request: LlmCompletionRequest,
  ): Anthropic.ContentBlock[] {
    const prompt = this.messageText(
      request.messages[request.messages.length - 1],
    );
    // The auditor prompt embeds the programmatic result; mirror it so the fake
    // verdict stays consistent with what the checker actually found.
    const programmaticFailed =
      /failed verification|without any citations/i.test(prompt);

    const verdict = programmaticFailed
      ? {
          status: 'partial',
          reasons:
            'Offline auditor: the programmatic checker could not verify every cited ' +
            'range against the source, so the answer cannot be marked trusted.',
        }
      : {
          status: 'trusted',
          reasons:
            'Offline auditor: every citation was resolved against the checkout and the ' +
            'cited ranges are non-empty. Note that no language model reviewed the ' +
            'reasoning — configure credentials for a substantive audit.',
        };

    return [
      { type: 'text', text: JSON.stringify(verdict), citations: [] },
    ] as unknown as Anthropic.ContentBlock[];
  }

  // -- transcript parsing ----------------------------------------------

  /**
   * Reconstructs what the agent has seen so far by parsing the tool_result
   * blocks already in the transcript. The formats parsed here are produced by
   * AgentService.runTool, so the two must stay in step — the round-trip is
   * covered by fake.provider.spec.ts.
   */
  private readObservations(messages: Anthropic.MessageParam[]): Observations {
    const dirEntries: string[] = [];
    const candidatePaths: string[] = [];
    let lastReadFile: ReadFileObservation | undefined;
    const rankedPaths: string[] = [];
    let listedRoot = false;
    let searchCount = 0;

    for (const message of messages) {
      if (message.role !== 'user' || typeof message.content === 'string') {
        continue;
      }
      for (const block of message.content) {
        if (block.type !== 'tool_result') continue;
        const text =
          typeof block.content === 'string'
            ? block.content
            : (block.content ?? [])
                .map((c) => (c.type === 'text' ? c.text : ''))
                .join('\n');

        if (text.startsWith('Listing of ')) {
          listedRoot = true;
          for (const line of text.split('\n').slice(1)) {
            const match = line.match(/^([df])\s+(.+)$/);
            if (match) dirEntries.push(match[2]);
          }
          continue;
        }

        if (text.startsWith('search_code ')) {
          searchCount += 1;
          for (const line of text.split('\n').slice(1)) {
            // "path (score 12.34)" — indented lines are the matched excerpt.
            const match = line.match(/^(\S+) \(score /);
            if (match) rankedPaths.push(match[1]);
          }
          continue;
        }

        if (text.startsWith('find_files ')) {
          searchCount += 1;
          for (const line of text.split('\n').slice(1)) {
            const trimmed = line.trim();
            if (
              !trimmed ||
              trimmed.startsWith('(') ||
              trimmed.startsWith('[')
            ) {
              continue;
            }
            if (this.looksReadable(trimmed)) candidatePaths.push(trimmed);
          }
          continue;
        }

        // "path (lines 1-40 of 120):"
        const readMatch = text.match(/^(.+?) \(lines (\d+)-(\d+) of (\d+)\):/);
        if (readMatch) {
          lastReadFile = {
            path: readMatch[1],
            startLine: Number.parseInt(readMatch[2], 10),
            endLine: Number.parseInt(readMatch[3], 10),
            totalLines: Number.parseInt(readMatch[4], 10),
          };
        }
      }
    }

    return {
      dirEntries,
      candidatePaths,
      rankedPaths,
      lastReadFile,
      listedRoot,
      searchCount,
    };
  }

  /** Picks a search term from the question, falling back to a listed folder. */
  private keywordFor(
    question: string,
    dirEntries: string[],
  ): string | undefined {
    const stop = new Set([
      'what',
      'where',
      'which',
      'does',
      'this',
      'that',
      'with',
      'have',
      'from',
      'into',
      'about',
      'how',
      'the',
      'and',
      'for',
      'are',
      'is',
      'it',
      'a',
      'an',
      'of',
      'to',
      'in',
      'do',
      'can',
      'you',
      'app',
      'code',
      'repo',
      'project',
      'explain',
      'show',
      'me',
    ]);
    const word = question
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((w) => w.length > 3 && !stop.has(w))
      .sort((a, b) => b.length - a.length)[0];

    if (word) return word;
    const dir = dirEntries.find((d) => ['src', 'app', 'lib'].includes(d));
    return dir;
  }

  private looksReadable(path: string): boolean {
    return /\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|cs|php|vue|svelte|md|json|yml|yaml|toml)$/i.test(
      path,
    );
  }

  private latestQuestion(messages: Anthropic.MessageParam[]): string {
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role === 'user' && typeof message.content === 'string') {
        return message.content;
      }
    }
    return 'this repository';
  }

  private messageText(message: Anthropic.MessageParam | undefined): string {
    if (!message) return '';
    if (typeof message.content === 'string') return message.content;
    return message.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('\n');
  }

  private toolUse(
    name: string,
    input: Record<string, unknown>,
  ): Anthropic.ContentBlock[] {
    return [
      {
        type: 'tool_use',
        id: `fake_${name}_${Math.random().toString(36).slice(2, 10)}`,
        name,
        input,
      },
    ] as unknown as Anthropic.ContentBlock[];
  }
}

type ReadFileObservation = {
  path: string;
  startLine: number;
  endLine: number;
  totalLines: number;
};

type Observations = {
  dirEntries: string[];
  candidatePaths: string[];
  /** Paths returned by search_code, already ordered by relevance. */
  rankedPaths: string[];
  lastReadFile?: ReadFileObservation;
  /** True once a list_dir result has been seen. */
  listedRoot: boolean;
  /** How many find_files results are already in the transcript. */
  searchCount: number;
};
