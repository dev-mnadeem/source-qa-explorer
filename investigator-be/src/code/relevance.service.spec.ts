import { join } from 'node:path';
import { CodeService } from '@/code/code.service';
import { RelevanceService } from '@/code/relevance.service';

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
