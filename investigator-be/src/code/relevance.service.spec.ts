import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeService } from '@/code/code.service';
import { RelevanceService } from '@/code/relevance.service';
import { REPO_CACHE_TTL_MS } from '@/shared/constants';

const FIXTURE = join(__dirname, '..', '..', 'test', 'fixtures', 'sample-repo');

describe('RelevanceService', () => {
  const service = new RelevanceService(new CodeService());

  it('ranks the auth module first for a question about authentication', async () => {
    // The vocabulary gap this exists to close: the question says
    // "authentication", the file is called auth.ts, and the word
    // "authentication" appears nowhere in the repository.
    const ranked = await service.rank(
      FIXTURE,
      'How are authentication tokens signed and verified?',
    );
    expect(ranked[0].path).toContain('auth.ts');
  });

  it('is not misled by a file that merely repeats a query word', async () => {
    // rateLimit.ts is a *token* bucket and says "tokens" far more often than
    // auth.ts does. Raw term frequency alone ranks it first; it must not.
    const ranked = await service.rank(FIXTURE, 'authentication tokens');
    const authIndex = ranked.findIndex((r) => r.path.includes('auth.ts'));
    const rateIndex = ranked.findIndex((r) => r.path.includes('rateLimit.ts'));
    expect(authIndex).toBeGreaterThanOrEqual(0);
    expect(authIndex).toBeLessThan(rateIndex);
  });

  it('finds the rate limiter from a description of its behaviour', async () => {
    const ranked = await service.rank(FIXTURE, 'how does the bucket refill');
    expect(ranked[0].path).toContain('rateLimit.ts');
  });

  it('reaches camelCase identifiers from separate words', async () => {
    // issueToken should be findable as "issue".
    const ranked = await service.rank(FIXTURE, 'issue a session');
    expect(ranked.some((r) => r.path.includes('auth.ts'))).toBe(true);
  });

  it('returns the best matching line so the agent can see why', async () => {
    const ranked = await service.rank(FIXTURE, 'timingSafeEqual');
    expect(ranked[0].bestLine?.text).toContain('timingSafeEqual');
    expect(ranked[0].bestLine?.line).toBeGreaterThan(0);
  });

  it('returns nothing for a query with no usable terms', async () => {
    expect(await service.rank(FIXTURE, 'the and of')).toEqual([]);
  });

  it('respects the result limit', async () => {
    const ranked = await service.rank(FIXTURE, 'token', 1);
    expect(ranked).toHaveLength(1);
  });

  it('scores every returned file above zero', async () => {
    const ranked = await service.rank(FIXTURE, 'token');
    expect(ranked.length).toBeGreaterThan(0);
    for (const r of ranked) expect(r.score).toBeGreaterThan(0);
  });
});

describe('RelevanceService index cache', () => {
  const roots: string[] = [];

  const makeRepo = async (body: string): Promise<string> => {
    const root = await mkdtemp(join(tmpdir(), 'relevance-cache-'));
    roots.push(root);
    await writeFile(join(root, 'main.ts'), body);
    return root;
  };

  afterEach(() => jest.restoreAllMocks());
  afterAll(async () => {
    await Promise.all(
      roots.map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('rebuilds an index once the checkout TTL has passed', async () => {
    const service = new RelevanceService(new CodeService());
    const root = await makeRepo('export const greeting = 1;');
    const start = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(start);

    expect(await service.rank(root, 'invoice')).toEqual([]);

    // A re-extracted checkout at the same path, with different contents.
    await writeFile(join(root, 'main.ts'), 'export const invoiceTotal = 2;');
    expect(await service.rank(root, 'invoice')).toEqual([]);

    jest.spyOn(Date, 'now').mockReturnValue(start + REPO_CACHE_TTL_MS + 1);
    const ranked = await service.rank(root, 'invoice');
    expect(ranked.map((r) => r.path)).toEqual(['main.ts']);
  });

  it('keeps at most 16 repository indexes', async () => {
    const service = new RelevanceService(new CodeService());
    for (let i = 0; i < 18; i++) {
      await service.rank(await makeRepo(`export const item${i} = ${i};`), 'x');
    }
    const cache = (service as unknown as { indexes: Map<string, unknown> })
      .indexes;
    expect(cache.size).toBe(16);
    expect(cache.has(roots[0])).toBe(false);
    expect(cache.has(roots[roots.length - 1])).toBe(true);
  });
});
