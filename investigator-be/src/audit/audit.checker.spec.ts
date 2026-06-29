import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodeService } from '@/code/code.service';
import { AuditChecker } from '@/audit/audit.checker';

describe('AuditChecker', () => {
  let checker: AuditChecker;
  let repoRoot: string;

  beforeAll(async () => {
    checker = new AuditChecker(new CodeService());
    repoRoot = await mkdtemp(join(tmpdir(), 'audit-checker-test-'));
    await mkdir(join(repoRoot, 'src'), { recursive: true });
    await writeFile(
      join(repoRoot, 'src', 'auth.ts'),
      [
        'export class AuthService {',
        '  verify(token: string) {',
        '    return token === "secret";',
        '  }',
        '}',
      ].join('\n'),
    );
    await writeFile(
      join(repoRoot, 'src', 'empty-block.ts'),
      ['line 1', '', '', '', 'line 5'].join('\n'),
    );
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  it('passes when all citations resolve to real lines', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/auth.ts', lineStart: 1, lineEnd: 5 },
    ]);
    expect(result.pass).toBe(true);
    expect(result.perCitation[0].verified).toBe(true);
    expect(result.perCitation[0].excerpt).toContain('AuthService');
  });

  it('fails when no citations are present', async () => {
    const result = await checker.check(repoRoot, []);
    expect(result.pass).toBe(false);
    expect(result.notes).toMatch(/without any citations/i);
  });

  it('fails when file does not exist', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/missing.ts', lineStart: 1, lineEnd: 5 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.perCitation[0].verified).toBe(false);
  });

  it('fails when line range exceeds file length', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/auth.ts', lineStart: 1, lineEnd: 999 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.perCitation[0].reason).toMatch(/exceeds file length/i);
  });

  it('fails when line range is invalid (start > end)', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/auth.ts', lineStart: 5, lineEnd: 2 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.perCitation[0].reason).toMatch(/invalid line range/i);
  });

  it('fails when cited range is whitespace-only', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/empty-block.ts', lineStart: 2, lineEnd: 4 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.perCitation[0].reason).toMatch(/whitespace-only/i);
  });

  it('reports mixed results when some citations pass and others fail', async () => {
    const result = await checker.check(repoRoot, [
      { filePath: 'src/auth.ts', lineStart: 1, lineEnd: 3 },
      { filePath: 'src/missing.ts', lineStart: 1, lineEnd: 5 },
    ]);
    expect(result.pass).toBe(false);
    expect(result.perCitation[0].verified).toBe(true);
    expect(result.perCitation[1].verified).toBe(false);
    expect(result.notes).toMatch(/1\/2/);
  });
});
