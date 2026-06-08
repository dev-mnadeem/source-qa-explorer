import { existsSync } from 'node:fs';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import {
  BadRequestException,
  Injectable,
  Logger,
  PayloadTooLargeException,
} from '@nestjs/common';
import * as tar from 'tar';
import {
  MAX_REPO_ARCHIVE_BYTES,
  REPO_CACHE_TTL_MS,
  REPO_CLONE_ROOT,
} from '@/shared/constants';
import { ParsedGithubUrl } from '@/repos/dto/parsed-github-url.dto';

@Injectable()
export class ReposService {
  private readonly logger = new Logger(ReposService.name);

  parseGithubUrl(input: string): ParsedGithubUrl {
    const trimmed = input.trim();
    // Accept https://github.com/owner/repo, https://github.com/owner/repo.git,
    // and trailing slashes.
    const match = trimmed.match(
      /^https?:\/\/github\.com\/([^/\s]+)\/([^/\s.]+)(\.git)?\/?$/i,
    );
    if (!match) {
      throw new BadRequestException(
        'Expected a public GitHub URL like https://github.com/owner/repo',
      );
    }
    const [, owner, name] = match;
    return {
      owner,
      name,
      cloneUrl: `https://github.com/${owner}/${name}.git`,
      webUrl: `https://github.com/${owner}/${name}`,
    };
  }

  pathFor(sessionId: string): string {
    return join(REPO_CLONE_ROOT, sessionId);
  }

  /**
   * Downloads the repo's default-branch tarball from GitHub, gunzips, and
   * extracts to the per-session directory. Strips the top-level wrapper dir
   * (GitHub adds `repo-HEAD/` to every entry).
   *
   * Why tarball instead of `git clone`: avoids depending on a system `git`
   * binary in the runtime container. Pure Node, works on Railway / Vercel /
   * Lambda / anywhere.
   */
  async clone(sessionId: string, parsed: ParsedGithubUrl): Promise<string> {
    const target = this.pathFor(sessionId);

    if (existsSync(target)) {
      this.logger.log(`Repo for session ${sessionId} already cached`);
      return target;
    }

    await mkdir(target, { recursive: true });

    const tarballUrl = `https://codeload.github.com/${parsed.owner}/${parsed.name}/tar.gz/HEAD`;
    this.logger.log(`Fetching ${tarballUrl}`);

    let response: Response;
    try {
      response = await fetch(tarballUrl, {
        headers: { 'User-Agent': 'codebase-investigator' },
      });
    } catch (err) {
      await this.remove(sessionId).catch(() => undefined);
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(
        `Failed to reach GitHub: ${message}. Check your internet connection.`,
      );
    }

    if (!response.ok || !response.body) {
      await this.remove(sessionId).catch(() => undefined);
      throw new BadRequestException(
        `Failed to fetch ${parsed.webUrl}: ${response.status} ${response.statusText}. Make sure the repo exists and is public.`,
      );
    }

    try {
      await pipeline(
        Readable.fromWeb(response.body as NodeReadableStream<Uint8Array>),
        this.byteLimiter(MAX_REPO_ARCHIVE_BYTES, parsed.webUrl),
        createGunzip(),
        // filter+ignore below refuse anything that is not a plain file or
        // directory. Archives are untrusted input: a symlink entry pointing at
        // /etc, or an absolute/../ path, must never reach the filesystem.
        tar.extract({
          cwd: target,
          strip: 1,
          filter: (path, entry) => {
            // `entry` is a ReadEntry during extraction; narrow before reading
            // .type so this holds under tar's Stats | ReadEntry union.
            const type = (entry as { type?: string }).type;
            if (type !== 'File' && type !== 'Directory') return false;
            return !path.startsWith('/') && !path.split('/').includes('..');
          },
        }),
      );
    } catch (err) {
      await this.remove(sessionId).catch(() => undefined);
      if (err instanceof PayloadTooLargeException) throw err;
      const message = err instanceof Error ? err.message : 'unknown error';
      throw new BadRequestException(
        `Failed to extract ${parsed.webUrl}: ${message}`,
      );
    }

    return target;
  }

  async remove(sessionId: string): Promise<void> {
    const target = this.pathFor(sessionId);
    if (!existsSync(target)) return;
    await rm(target, { recursive: true, force: true });
  }

  /**
   * Counts bytes as the archive streams past and destroys the pipeline the
   * moment the ceiling is crossed. Checking Content-Length instead would trust
   * a header the remote controls, and would still buffer the whole body.
   */
  private byteLimiter(limit: number, repoUrl: string): Transform {
    let total = 0;
    return new Transform({
      transform(chunk: Buffer, _enc, callback) {
        total += chunk.byteLength;
        if (total > limit) {
          callback(
            new PayloadTooLargeException(
              `${repoUrl} exceeds the ${Math.round(limit / 1024 / 1024)}MB ` +
                'archive limit. Try a smaller repository.',
            ),
          );
          return;
        }
        callback(null, chunk);
      },
    });
  }

  /**
   * Deletes cached clones older than the TTL.
   *
   * Without this the clone root grows for the life of the process: every
   * session downloads a repository and nothing ever removes it. Called on a
   * schedule by ReposCleanupService.
   */
  async evictStale(now = Date.now()): Promise<number> {
    if (!existsSync(REPO_CLONE_ROOT)) return 0;
    let evicted = 0;
    const entries = await readdir(REPO_CLONE_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = join(REPO_CLONE_ROOT, entry.name);
      try {
        const stats = await stat(full);
        if (now - stats.mtimeMs > REPO_CACHE_TTL_MS) {
          await rm(full, { recursive: true, force: true });
          evicted += 1;
        }
      } catch {
        // Raced with another eviction or a manual delete — nothing to do.
      }
    }
    if (evicted > 0) {
      this.logger.log(`Evicted ${evicted} stale repo clone(s)`);
    }
    return evicted;
  }
}
