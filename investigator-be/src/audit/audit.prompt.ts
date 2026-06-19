import { ProgrammaticCheckResult } from '@/audit/dto/audit-result.dto';

export const AUDITOR_SYSTEM_PROMPT = `You are an independent code reviewer auditing another assistant's answer about a codebase.

Your job is NOT to answer the user's question — it's to judge whether the assistant's answer is trustworthy.

Be skeptical. Specifically look for:
1. CITATIONS THAT DON'T MATCH: claims that the cited code does not actually support.
2. HALLUCINATED FACTS: claims about behavior, types, or flow that aren't backed by the code shown.
3. OVERREACH: confident assertions that go beyond what the cited evidence shows.
4. SUGGESTED FIXES THAT WOULD BREAK SOMETHING ELSE: refactor advice that ignores callers / consumers.
5. LOGICAL GAPS: reasoning that skips a step or relies on an unstated assumption.

You can ALSO praise sound work — if the answer is well-grounded and the citations support it, say "trusted" with a one-line reason.

Output a verdict in this exact JSON format (no markdown, no prose outside the JSON):

{"status": "trusted" | "partial" | "suspect", "reasons": "<one paragraph, ~3-6 sentences, explaining the verdict>"}

Verdict guide:
- "trusted" — claims map cleanly to the cited code, no overreach, no obvious gaps.
- "partial" — mostly right, but at least one claim is unsupported, overstated, or worth caveating.
- "suspect" — significant disconnect between claims and code, hallucinated citations, or reasoning that wouldn't hold up.

If the programmatic check has flagged failures, take that into account but form your own opinion — sometimes the LLM answer is still useful even with one bad citation.`;

export function buildAuditorUserPrompt(input: {
  question: string;
  answer: string;
  citedExcerpts: Array<{
    filePath: string;
    lineStart: number;
    lineEnd: number;
    excerpt: string | undefined;
    verified: boolean;
    reason?: string;
  }>;
  programmatic: ProgrammaticCheckResult;
}): string {
  const excerptBlocks =
    input.citedExcerpts.length === 0
      ? '(none provided)'
      : input.citedExcerpts
          .map((c) => {
            const status = c.verified
              ? 'VERIFIED'
              : `UNVERIFIED (${c.reason ?? 'unknown reason'})`;
            const body = c.excerpt
              ? '```\n' + c.excerpt + '\n```'
              : '(file/range could not be read)';
            return `--- ${c.filePath}:${c.lineStart}-${c.lineEnd} [${status}] ---\n${body}`;
          })
          .join('\n\n');

  return `# User question
${input.question}

# Assistant answer
${input.answer}

# Programmatic citation check
${input.programmatic.notes}

# Cited excerpts (the assistant claims these support the answer)
${excerptBlocks}

Now produce the JSON verdict.`;
}
