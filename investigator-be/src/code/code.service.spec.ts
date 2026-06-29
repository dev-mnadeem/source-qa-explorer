import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { CodeService } from '@/code/code.service';

describe('CodeService', () => {
  let service: CodeService;
  let repoRoot: string;

  beforeAll(async () => {
    service = new CodeService();
    repoRoot = await mkdtemp(join(tmpdir(), 'code-service-test-'));
    await mkdir(join(repoRoot, 'src'), { recursive: true });
    await writeFile(
      join(repoRoot, 'src', 'index.ts'),
      [
        'export function add(a: number, b: number) {',
        '  return a + b;',
        '}',
        '',
        'export function multiply(a: number, b: number) {',
        '  return a * b;',
        '}',
      ].join('\n'),
    );
    await writeFile(
      join(repoRoot, 'README.md'),
      '# Test repo\n\nUses the add function.\n',
    );
  });

  afterAll(async () => {
    await rm(repoRoot, { recursive: true, force: true });
  });

  describe('readFile', () => {
    it('reads full file with line metadata', async () => {
      const result = await service.readFile(repoRoot, 'src/index.ts');
      expect(result.totalLines).toBeGreaterThan(0);
      expect(result.content).toContain('export function add');
    });

    it('reads a line range', async () => {
      const result = await service.readFile(repoRoot, 'src/index.ts', 5, 7);
      expect(result.startLine).toBe(5);
      expect(result.content).toContain('multiply');
      expect(result.content).not.toContain('export function add');
    });

    it('rejects path traversal', async () => {
      await expect(
        service.readFile(repoRoot, '../escape.txt'),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws on missing file', async () => {
      await expect(service.readFile(repoRoot, 'nope.ts')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('listDir', () => {
    it('lists root contents', async () => {
      const result = await service.listDir(repoRoot);
      const names = result.entries.map((e) => e.name).sort();
      expect(names).toEqual(['README.md', 'src'].sort());
    });
  });

  describe('findFiles', () => {
    it('finds by partial name', async () => {
      const result = await service.findFiles(repoRoot, 'index');
      expect(result.paths).toContain('src/index.ts');
    });
  });

  describe('grep', () => {
    it('finds occurrences across files', async () => {
      const result = await service.grep(repoRoot, 'add');
      const paths = new Set(result.matches.map((m) => m.path));
      expect(paths.size).toBeGreaterThan(0);
      const indexMatch = result.matches.find((m) => m.path === 'src/index.ts');
      expect(indexMatch?.line).toBe(1);
    });
  });
});
