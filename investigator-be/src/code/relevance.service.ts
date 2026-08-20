import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { CodeService } from '@/code/code.service';

/** Cap on files indexed per repository, to bound memory and index time. */
const MAX_INDEXED_FILES = 1500;
const MAX_FILE_BYTES = 400_000;

/** Standard BM25 constants: term-frequency saturation and length normalisation. */
const K1 = 1.5;
const B = 0.75;

export type RankedFile = {
  path: string;
  score: number;
  /** Best-matching line, for showing the agent why this file ranked. */
  bestLine?: { line: number; text: string };
};

type IndexedFile = {
  path: string;
  termFrequencies: Map<string, number>;
  length: number;
  lines: string[];
};

type RepoIndex = {
  files: IndexedFile[];
  documentFrequencies: Map<string, number>;
  averageLength: number;
  builtAt: number;
};

/**
 * Relevance-ranked search over a repository.
 *
 * The existing tools are exact-match: `grep` finds a literal string and
 * `find_files` matches a path substring. Both fail on the ordinary case where
 * a question's vocabulary differs from the code's — asking about
 * "authentication" finds nothing in a repository whose file is called
 * `auth.ts`. That gap is the single largest source of wrong answers.
 *
 * Scoring is BM25 over identifier-aware tokens. Deliberately not embeddings:
 * BM25 needs no model, no network and no credentials, so it works in CI and in
 * the offline demo, and on code — which is short, keyword-dense text full of
 * exact identifiers — it is a strong baseline rather than a compromise. The
 * splitting of camelCase and snake_case into their parts is what lets
 * "authentication" reach `issueToken` in `auth.ts`.
 *
 * If dense retrieval is wanted later, `rank()` is the seam: give this class an
 * injected embedding provider and blend the two scores. Nothing above it needs
 * to change.
 */
@Injectable()
export class RelevanceService {
  private readonly logger = new Logger(RelevanceService.name);
  private readonly indexes = new Map<string, RepoIndex>();

  constructor(private readonly code: CodeService) {}

  async rank(
    repoRoot: string,
    query: string,
    limit = 10,
  ): Promise<RankedFile[]> {
    const index = await this.getIndex(repoRoot);
    const queryTerms = this.tokenize(query);
    if (queryTerms.length === 0 || index.files.length === 0) return [];

    const totalDocs = index.files.length;
    const scored: RankedFile[] = [];

    // Expand each query term to the index terms it plausibly refers to, so a
    // question's vocabulary can reach the code's. See expandTerm.
    const expanded = new Map<string, Array<{ term: string; weight: number }>>();
    for (const term of new Set(queryTerms)) {
      expanded.set(term, this.expandTerm(term, index));
    }

    for (const file of index.files) {
      let score = 0;
      for (const [, variants] of expanded) {
        // Take only the best-matching variant per query term, so a term that
        // expands to several forms cannot count several times over.
        let best = 0;
        for (const { term, weight } of variants) {
          const termFrequency = file.termFrequencies.get(term);
          if (!termFrequency) continue;

          const docFrequency = index.documentFrequencies.get(term) ?? 0;
          // Standard BM25 IDF, smoothed so a term in every document scores ~0
          // rather than going negative.
          const idf = Math.log(
            1 + (totalDocs - docFrequency + 0.5) / (docFrequency + 0.5),
          );
          const norm =
            termFrequency +
            K1 * (1 - B + (B * file.length) / (index.averageLength || 1));
          best = Math.max(
            best,
            weight * idf * ((termFrequency * (K1 + 1)) / norm),
          );
        }
        score += best;
      }

      // A filename match is strong evidence in a codebase: someone naming a
      // file `auth.ts` is a clearer signal than one mention in a comment.
      // Stem-expanded matches count here too, which is what lets a question
      // about "authentication" outrank a file that merely says "token" a lot.
      const pathTokens = new Set(this.tokenize(file.path));
      let pathHits = 0;
      for (const [, variants] of expanded) {
        if (variants.some((v) => pathTokens.has(v.term))) pathHits += 1;
      }
      score += pathHits * 3;

      if (score > 0) {
        scored.push({
          path: file.path,
          score: Number(score.toFixed(4)),
          bestLine: this.bestLine(file, queryTerms),
        });
      }
    }

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Maps a query term onto the index terms it plausibly refers to.
   *
   * Code and prose rarely agree on wording: a question says "authentication"
   * where the file is called `auth.ts`, or "verified" where the function is
   * `verifyToken`. Exact matching misses all of it.
   *
   * Rather than ship a full stemmer, this treats a shared prefix of at least
   * four characters as evidence of a shared root, discounted so an exact match
   * always outranks an approximate one. That is enough for the
   * inflection-and-abbreviation cases that dominate code search, and it costs
   * no model and no network.
   */
  private expandTerm(
    term: string,
    index: RepoIndex,
  ): Array<{ term: string; weight: number }> {
    const variants: Array<{ term: string; weight: number }> = [];
    if (index.documentFrequencies.has(term)) {
      variants.push({ term, weight: 1 });
    }
    if (term.length < 4) return variants;

    for (const candidate of index.documentFrequencies.keys()) {
      if (candidate === term || candidate.length < 4) continue;
      const shared = this.sharedPrefixLength(term, candidate);
      if (shared < 4) continue;
      // Weight by how much of the longer word the shared root covers, so
      // auth/authentication scores well and auth/author does not.
      const coverage = shared / Math.max(term.length, candidate.length);
      variants.push({ term: candidate, weight: 0.6 * coverage });
    }
    return variants;
  }

  private sharedPrefixLength(a: string, b: string): number {
    const max = Math.min(a.length, b.length);
    let i = 0;
    while (i < max && a[i] === b[i]) i++;
    return i;
  }

  /** Drops a cached index, e.g. once a checkout has been evicted. */
  invalidate(repoRoot: string): void {
    this.indexes.delete(repoRoot);
  }

  // -- indexing --------------------------------------------------------

  private async getIndex(repoRoot: string): Promise<RepoIndex> {
    const cached = this.indexes.get(repoRoot);
    if (cached) return cached;

    const started = Date.now();
    const found = await this.code.findFiles(repoRoot, '.', MAX_INDEXED_FILES);
    const files: IndexedFile[] = [];
    const documentFrequencies = new Map<string, number>();

    for (const path of found.paths) {
      if (!this.isIndexable(path)) continue;
      const indexed = await this.indexFile(repoRoot, path);
      if (!indexed) continue;
      files.push(indexed);
      for (const term of indexed.termFrequencies.keys()) {
        documentFrequencies.set(term, (documentFrequencies.get(term) ?? 0) + 1);
      }
    }

    const averageLength =
      files.length === 0
        ? 0
        : files.reduce((sum, f) => sum + f.length, 0) / files.length;

    const index: RepoIndex = {
      files,
      documentFrequencies,
      averageLength,
      builtAt: Date.now(),
    };
    this.indexes.set(repoRoot, index);
    this.logger.log(
      `Indexed ${files.length} files in ${Date.now() - started}ms for ${repoRoot}`,
    );
    return index;
  }

  private async indexFile(
    repoRoot: string,
    path: string,
  ): Promise<IndexedFile | null> {
    try {
      const buf = await readFile(join(repoRoot, path));
      if (buf.byteLength > MAX_FILE_BYTES) return null;
      // A NUL byte in the first block is the cheap, reliable binary test.
      if (buf.subarray(0, 1024).includes(0)) return null;

      const text = buf.toString('utf8');
      const lines = text.split(/\r?\n/);
      const termFrequencies = new Map<string, number>();
      // Index the path too, so filenames contribute to the document.
      for (const term of this.tokenize(`${path}\n${text}`)) {
        termFrequencies.set(term, (termFrequencies.get(term) ?? 0) + 1);
      }
      const length = [...termFrequencies.values()].reduce((a, b) => a + b, 0);
      return { path, termFrequencies, length, lines };
    } catch {
      return null;
    }
  }

  private bestLine(
    file: IndexedFile,
    queryTerms: string[],
  ): RankedFile['bestLine'] {
    const wanted = new Set(queryTerms);
    let best: { line: number; text: string; hits: number } | undefined;

    for (let i = 0; i < file.lines.length; i++) {
      const tokens = this.tokenize(file.lines[i]);
      const hits = tokens.filter((t) => wanted.has(t)).length;
      if (hits > 0 && (!best || hits > best.hits)) {
        best = { line: i + 1, text: file.lines[i].trim().slice(0, 200), hits };
      }
    }
    return best ? { line: best.line, text: best.text } : undefined;
  }

  /**
   * Splits text into terms, then splits identifiers into their parts.
   *
   * `issueToken` yields `issuetoken`, `issue`, `token`; `rate_limit` yields
   * `rate_limit`, `rate`, `limit`. Emitting both the whole identifier and its
   * parts is what lets a natural-language question reach code that never uses
   * the questioner's exact wording.
   */
  private tokenize(text: string): string[] {
    const out: string[] = [];
    for (const raw of text.split(/[^A-Za-z0-9_]+/)) {
      if (!raw) continue;
      const lower = raw.toLowerCase();
      if (lower.length < 2 || STOP_WORDS.has(lower)) continue;
      out.push(lower);

      for (const part of raw
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .split(/[_\s]+/)) {
        const p = part.toLowerCase();
        if (p.length >= 3 && p !== lower && !STOP_WORDS.has(p)) out.push(p);
      }
    }
    return out;
  }

  private isIndexable(path: string): boolean {
    return /\.(ts|tsx|js|jsx|mjs|cjs|py|rb|go|rs|java|kt|cs|php|vue|svelte|swift|scala|sh|sql|md|json|ya?ml|toml)$/i.test(
      path,
    );
  }
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'this',
  'that',
  'with',
  'from',
  'they',
  'been',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'would',
  'there',
  'their',
  'then',
  'than',
  'into',
  'about',
  'does',
  'how',
  'why',
  'who',
  'whom',
  'its',
  'it',
  'is',
  'of',
  'to',
  'in',
  'on',
  'at',
  'by',
  'as',
  'an',
  'or',
  'if',
  'be',
  'do',
  'we',
  'use',
  'using',
  'const',
  'let',
  'var',
  'import',
  'export',
  'return',
  'function',
  'class',
  'type',
  'interface',
  'string',
  'number',
  'boolean',
  'void',
  'null',
  'undefined',
  'true',
  'false',
]);
