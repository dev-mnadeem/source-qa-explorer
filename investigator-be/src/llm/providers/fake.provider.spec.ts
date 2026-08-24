import type Anthropic from '@anthropic-ai/sdk';
import { AGENT_TOOLS } from '@/agent/agent.tools';
import { FakeLlmProvider } from '@/llm/providers/fake.provider';
import { LlmCompletionRequest } from '@/llm/llm.types';

/**
 * The fake provider is only useful if it stays in step with the transcript
 * format AgentService actually produces. These tests pin that contract: if
 * runTool's output strings change, the parsing here must change with them.
 */
describe('FakeLlmProvider', () => {
  const provider = new FakeLlmProvider();

  const investigate = (
    messages: Anthropic.MessageParam[],
  ): LlmCompletionRequest => ({
    model: 'test-model',
    maxTokens: 1024,
    system: 'system',
    messages,
    tools: AGENT_TOOLS,
  });

  const toolResult = (text: string): Anthropic.MessageParam => ({
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: 'x',
        content: text,
      },
    ],
  });

  const assistantTurn = (): Anthropic.MessageParam => ({
    role: 'assistant',
    content: [
      { type: 'text', text: 'thinking' } as unknown as Anthropic.ContentBlock,
    ],
  });

  const toolUseIn = (content: Anthropic.ContentBlock[]) =>
    content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

  it('opens by listing the repository root', async () => {
    const res = await provider.complete(
      investigate([{ role: 'user', content: 'where is auth handled?' }]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('list_dir');
    expect(tool?.input).toEqual({ path: '.' });
  });

  it('reaches for relevance-ranked search before filename matching', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how does authentication work?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src\nf package.json'),
      ]),
    );
    const tool = toolUseIn(res.content);
    // search_code understands that "authentication" means auth.ts; the older
    // filename-substring search did not, so it leads.
    expect(tool?.name).toBe('search_code');
    expect((tool?.input as { query: string }).query).toBe(
      'how does authentication work?',
    );
  });

  it('reads the top-ranked file returned by search_code', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how does authentication work?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src'),
        assistantTurn(),
        toolResult(
          'search_code "how does authentication work?": 2 ranked files\n' +
            'src/auth.ts (score 18.2)\n    12: export function issueToken(\n' +
            'src/rateLimit.ts (score 4.1)\n    5: const CAPACITY = 10;',
        ),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('read_file');
    // Ranking already encodes relevance, so the top hit is taken in order.
    expect((tool?.input as { path: string }).path).toBe('src/auth.ts');
  });

  it('reads a file that the search actually returned', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how does routing work?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src'),
        assistantTurn(),
        toolResult('find_files routing: 2 matches\nsrc/routes.ts\nREADME.md'),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('read_file');
    expect((tool?.input as { path: string }).path).toBe('src/routes.ts');
  });

  it('cites a line range bounded by what it actually read', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how does routing work?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src'),
        assistantTurn(),
        toolResult('find_files routing: 1 matches\nsrc/routes.ts'),
        assistantTurn(),
        toolResult('src/routes.ts (lines 1-40 of 120):\n1: import x'),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('submit_answer');

    const input = tool?.input as {
      citations: Array<{
        file_path: string;
        line_start: number;
        line_end: number;
      }>;
    };
    expect(input.citations).toHaveLength(1);
    const [citation] = input.citations;
    expect(citation.file_path).toBe('src/routes.ts');
    expect(citation.line_start).toBe(1);
    // Never beyond the range the read actually returned.
    expect(citation.line_end).toBeLessThanOrEqual(40);
  });

  it('falls back to filename search when ranking returns nothing', async () => {
    // Regression: a turn-counter version answered here with nothing read.
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how are separators handled?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src\nf index.js'),
        assistantTurn(),
        toolResult('search_code "separators": 0 ranked files\n(no matches)'),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('find_files');
  });

  it('reaches a file even when the question keyword matches nothing', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'how are separators handled?' },
        assistantTurn(),
        toolResult('Listing of .:\nd src\nf index.js'),
        assistantTurn(),
        toolResult('search_code "separators": 0 ranked files\n(no matches)'),
        assistantTurn(),
        toolResult('find_files separators: 0 matches\n(no matches)'),
        assistantTurn(),
        toolResult('find_files .: 1 matches\nindex.js'),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('read_file');
    expect((tool?.input as { path: string }).path).toBe('index.js');
  });

  it('submits no citations when the repo really yielded nothing', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'anything?' },
        assistantTurn(),
        toolResult('Listing of .:\n(empty)'),
        assistantTurn(),
        toolResult('search_code "zzzz": 0 ranked files\n(no matches)'),
        assistantTurn(),
        toolResult('find_files zzz: 0 matches\n(no matches)'),
        assistantTurn(),
        toolResult('find_files .: 0 matches\n(no matches)'),
        assistantTurn(),
        toolResult('find_files .: 0 matches\n(no matches)'),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect(tool?.name).toBe('submit_answer');
    const input = tool?.input as { citations: unknown[] };
    expect(input.citations).toEqual([]);
  });

  it('prefers an entry point over a deeper path', async () => {
    const res = await provider.complete(
      investigate([
        { role: 'user', content: 'explain it' },
        assistantTurn(),
        toolResult('Listing of .:\nd src'),
        assistantTurn(),
        toolResult('search_code "explain it": 0 ranked files\n(no matches)'),
        assistantTurn(),
        toolResult(
          'find_files .: 3 matches\nsrc/deep/nested/helper.ts\nsrc/index.ts\nsrc/other.ts',
        ),
      ]),
    );
    const tool = toolUseIn(res.content);
    expect((tool?.input as { path: string }).path).toBe('src/index.ts');
  });

  describe('auditor mode', () => {
    const audit = (prompt: string): LlmCompletionRequest => ({
      model: 'test-model',
      maxTokens: 600,
      system: 'auditor',
      messages: [{ role: 'user', content: prompt }],
    });

    it('returns trusted JSON when the programmatic check passed', async () => {
      const res = await provider.complete(
        audit('All 2 citation(s) verified against the source.'),
      );
      const text = (res.content[0] as Anthropic.TextBlock).text;
      expect(JSON.parse(text)).toMatchObject({ status: 'trusted' });
    });

    it('downgrades to partial when citations failed verification', async () => {
      const res = await provider.complete(
        audit('1/2 citation(s) failed verification:\n- a.ts:1-2 — not found'),
      );
      const text = (res.content[0] as Anthropic.TextBlock).text;
      expect(JSON.parse(text)).toMatchObject({ status: 'partial' });
    });

    it('does not claim an answer is trusted when it had no citations', async () => {
      const res = await provider.complete(
        audit('The answer was submitted without any citations.'),
      );
      const text = (res.content[0] as Anthropic.TextBlock).text;
      const parsed = JSON.parse(text) as { status: string };
      expect(parsed.status).not.toBe('trusted');
    });
  });
});
