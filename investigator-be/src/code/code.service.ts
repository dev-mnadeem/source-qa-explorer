import { spawn } from 'node:child_process';
import { Dirent } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, normalize, relative, resolve, sep } from 'node:path';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { MAX_FILE_READ_BYTES, MAX_GREP_RESULTS } from '@/shared/constants';
import {
  DirEntry,
  FindFilesResult,
  GrepMatch,
  GrepResult,
  ListDirResult,
  ReadFileResult,
} from '@/code/dto/code-tools.dto';

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  '.venv',
  '__pycache__',
  'target',
]);

@Injectable()
export class CodeService {
  private readonly logger = new Logger(CodeService.name);
  private rgAvailable: boolean | undefined;

  /**
   * Resolve a path *relative to repoRoot* and ensure it doesn't escape.
   * Throws BadRequestException if it does.
   */
  private safeJoin(repoRoot: string, relPath: string): string {
    const cleaned = normalize(relPath ?? '.').replace(/^[\\/]+/, '');
    if (cleaned.startsWith('..') || cleaned.includes(`..${sep}`)) {
      throw new BadRequestException(`Path "${relPath}" escapes the repo root`);
    }
    const absolute = resolve(repoRoot, cleaned);
    const rooted = resolve(repoRoot);
    if (absolute !== rooted && !absolute.startsWith(rooted + sep)) {
      throw new BadRequestException(`Path "${relPath}" escapes the repo root`);
    }
    return absolute;
  }

  async readFile(
    repoRoot: string,
    path: string,
    lineStart?: number,
    lineEnd?: number,
  ): Promise<ReadFileResult> {
    const absolute = this.safeJoin(repoRoot, path);
    const stats = await stat(absolute).catch(() => null);
    if (!stats || !stats.isFile()) {
      throw new BadRequestException(`File not found: ${path}`);
    }

    const buf = await readFile(absolute);
    const truncated = buf.byteLength > MAX_FILE_READ_BYTES;
    const sliced = truncated ? buf.subarray(0, MAX_FILE_READ_BYTES) : buf;
    const text = sliced.toString('utf8');
    const allLines = text.split(/\r?\n/);
    const totalLines = allLines.length;

    const start = lineStart && lineStart > 0 ? lineStart : 1;
    const end = lineEnd && lineEnd >= start ? lineEnd : totalLines;
    const slicedLines = allLines.slice(start - 1, end);

    return {
      path,
      totalLines,
      startLine: start,
      endLine: Math.min(end, totalLines),
      truncated,
      content: slicedLines.join('\n'),
    };
  }

  async listDir(repoRoot: string, path = '.'): Promise<ListDirResult> {
    const absolute = this.safeJoin(repoRoot, path);
    const stats = await stat(absolute).catch(() => null);
    if (!stats || !stats.isDirectory()) {
      throw new BadRequestException(`Directory not found: ${path}`);
    }
    const dirents = await readdir(absolute, { withFileTypes: true });
    const entries: DirEntry[] = dirents
      .filter((d) => !IGNORED_DIRS.has(d.name))
      .map<DirEntry>((d) => ({
        name: d.name,
        type: d.isDirectory() ? 'dir' : 'file',
      }))
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    return { path: path === '' ? '.' : path, entries };
  }

  async findFiles(
    repoRoot: string,
    pattern: string,
    limit = 200,
  ): Promise<FindFilesResult> {
    const lower = pattern.toLowerCase();
    const matches: string[] = [];
    await this.walk(repoRoot, repoRoot, (rel) => {
      if (rel.toLowerCase().includes(lower)) matches.push(rel);
      return matches.length < limit;
    });
    return {
      pattern,
      paths: matches.slice(0, limit),
      truncated: matches.length >= limit,
    };
  }

  async grep(
    repoRoot: string,
    pattern: string,
    options: { caseInsensitive?: boolean; glob?: string } = {},
  ): Promise<GrepResult> {
    if (await this.canUseRipgrep()) {
      return this.grepWithRipgrep(repoRoot, pattern, options);
    }
    return this.grepWithNode(repoRoot, pattern, options);
  }

  // ----- helpers --------------------------------------------------------

  private async walk(
    repoRoot: string,
    dir: string,
    onPath: (relativePath: string, dirent: Dirent) => boolean,
  ): Promise<void> {
    let dirents: Dirent[];
    try {
      dirents = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const dirent of dirents) {
      if (IGNORED_DIRS.has(dirent.name)) continue;
      const full = join(dir, dirent.name);
      const rel = relative(repoRoot, full);
      if (dirent.isDirectory()) {
        await this.walk(repoRoot, full, onPath);
      } else if (dirent.isFile()) {
        const cont = onPath(rel, dirent);
        if (!cont) return;
      }
    }
  }

  private async canUseRipgrep(): Promise<boolean> {
    if (this.rgAvailable !== undefined) return this.rgAvailable;
    this.rgAvailable = await new Promise<boolean>((res) => {
      const child = spawn('rg', ['--version'], { stdio: 'ignore' });
      child.on('error', () => res(false));
      child.on('close', (code) => res(code === 0));
    });
    if (!this.rgAvailable) {
      this.logger.warn('ripgrep not found, falling back to Node grep');
    }
    return this.rgAvailable;
  }

  private grepWithRipgrep(
    repoRoot: string,
    pattern: string,
    options: { caseInsensitive?: boolean; glob?: string },
  ): Promise<GrepResult> {
    return new Promise((res, rej) => {
      const args = [
        '--line-number',
        '--no-heading',
        '--color=never',
        '--max-count=20',
        '--max-filesize=1M',
      ];
      if (options.caseInsensitive) args.push('-i');
      if (options.glob) args.push('-g', options.glob);
      for (const dir of IGNORED_DIRS) args.push('-g', `!${dir}`);
      args.push('--', pattern, '.');

      const child = spawn('rg', args, { cwd: repoRoot });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => (stdout += d.toString()));
      child.stderr.on('data', (d) => (stderr += d.toString()));
      child.on('error', rej);
      child.on('close', (code) => {
        // rg exits 1 when no matches — that's fine.
        if (code !== 0 && code !== 1) {
          return rej(new Error(`ripgrep failed: ${stderr || `exit ${code}`}`));
        }
        const matches: GrepMatch[] = [];
        for (const rawLine of stdout.split('\n')) {
          if (!rawLine || matches.length >= MAX_GREP_RESULTS) break;
          // format: path:line:text
          const firstColon = rawLine.indexOf(':');
          const secondColon = rawLine.indexOf(':', firstColon + 1);
          if (firstColon === -1 || secondColon === -1) continue;
          const path = rawLine.slice(0, firstColon);
          const lineStr = rawLine.slice(firstColon + 1, secondColon);
          const text = rawLine.slice(secondColon + 1);
          const line = Number.parseInt(lineStr, 10);
          if (!Number.isFinite(line)) continue;
          matches.push({ path, line, text });
        }
        res({
          pattern,
          matches,
          truncated: matches.length >= MAX_GREP_RESULTS,
        });
      });
    });
  }

  private async grepWithNode(
    repoRoot: string,
    pattern: string,
    options: { caseInsensitive?: boolean; glob?: string },
  ): Promise<GrepResult> {
    const re = new RegExp(
      this.escapeRegex(pattern),
      options.caseInsensitive ? 'i' : '',
    );
    const candidates: string[] = [];
    await this.walk(repoRoot, repoRoot, (rel) => {
      if (options.glob && !this.simpleGlobMatch(rel, options.glob)) return true;
      candidates.push(rel);
      return true;
    });
    const matches: GrepMatch[] = [];
    for (const rel of candidates) {
      if (matches.length >= MAX_GREP_RESULTS) break;
      await this.scanFile(repoRoot, rel, re, matches);
    }
    return {
      pattern,
      matches: matches.slice(0, MAX_GREP_RESULTS),
      truncated: matches.length >= MAX_GREP_RESULTS,
    };
  }

  private async scanFile(
    repoRoot: string,
    rel: string,
    re: RegExp,
    out: GrepMatch[],
  ): Promise<void> {
    try {
      const buf = await readFile(join(repoRoot, rel));
      if (buf.byteLength > 1_000_000) return;
      const lines = buf.toString('utf8').split(/\r?\n/);
      for (let i = 0; i < lines.length; i++) {
        if (re.test(lines[i])) {
          out.push({ path: rel, line: i + 1, text: lines[i] });
          if (out.length >= MAX_GREP_RESULTS) return;
        }
      }
    } catch {
      // unreadable file (binary, permission, etc.) — skip
    }
  }

  private escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private simpleGlobMatch(path: string, glob: string): boolean {
    const re = new RegExp(
      '^' +
        glob
          .replace(/[.+^${}()|[\]\\]/g, '\\$&')
          .replace(/\*\*/g, '__GLOBSTAR__')
          .replace(/\*/g, '[^/]*')
          .replace(/__GLOBSTAR__/g, '.*')
          .replace(/\?/g, '[^/]') +
        '$',
    );
    return re.test(path);
  }
}
