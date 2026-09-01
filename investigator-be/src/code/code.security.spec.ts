import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BadRequestException } from '@nestjs/common';
import { CodeService } from '@/code/code.service';

/**
 * Containment tests for the code tools.
 *
 * Repositories are untrusted tarballs fetched from GitHub, so a repo is free
 * to contain a symlink pointing anywhere on the host. A path check that only
 * inspects the string accepts those happily. These tests build exactly that
 * layout on disk and assert the service refuses to read through it.
 */
describe('CodeService containment', () => {
  let root: string;
  let repoRoot: string;
  let secretPath: string;
  const service = new CodeService();

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'ci-sec-'));
    repoRoot = join(root, 'repo');
    await mkdir(join(repoRoot, 'src'), { recursive: true });

    secretPath = join(root, 'secret.txt');
    await writeFile(secretPath, 'TOP SECRET HOST FILE\n');
    await writeFile(join(repoRoot, 'src', 'index.ts'), 'export const a = 1;\n');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('reads ordinary files inside the repo', async () => {
    const result = await service.readFile(repoRoot, 'src/index.ts');
    expect(result.content).toContain('export const a = 1;');
  });

  it('rejects traversal with ../ before touching the filesystem', async () => {
    await expect(service.readFile(repoRoot, '../secret.txt')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('rejects a symlinked file that escapes the repo root', async () => {
    await symlink(secretPath, join(repoRoot, 'leak.txt'));
    await expect(service.readFile(repoRoot, 'leak.txt')).rejects.toThrow(
      /escapes|outside the repo root/i,
    );
  });

  it('rejects reading through a symlinked directory', async () => {
    await symlink(root, join(repoRoot, 'up'));
    await expect(service.readFile(repoRoot, 'up/secret.txt')).rejects.toThrow(
      /escapes|outside the repo root/i,
    );
  });

  it('rejects listing a symlinked directory that escapes', async () => {
    await symlink(root, join(repoRoot, 'up'));
    await expect(service.listDir(repoRoot, 'up')).rejects.toThrow(
      /escapes|outside the repo root/i,
    );
  });

  it('does not surface symlinks in a directory listing', async () => {
    await symlink(secretPath, join(repoRoot, 'leak.txt'));
    const listing = await service.listDir(repoRoot, '.');
    expect(listing.entries.map((e) => e.name)).not.toContain('leak.txt');
  });

  it('does not follow symlinks when walking for find_files', async () => {
    await symlink(root, join(repoRoot, 'up'));
    const found = await service.findFiles(repoRoot, 'secret');
    expect(found.paths).toHaveLength(0);
  });

  it('allows a symlink that stays inside the repo', async () => {
    // Containment, not a blanket ban on symlinks: an internal link resolves
    // within the root and is legitimate.
    await writeFile(join(repoRoot, 'src', 'real.ts'), 'export const b = 2;\n');
    await symlink(join(repoRoot, 'src', 'real.ts'), join(repoRoot, 'alias.ts'));
    const result = await service.readFile(repoRoot, 'alias.ts');
    expect(result.content).toContain('export const b = 2;');
  });
});
