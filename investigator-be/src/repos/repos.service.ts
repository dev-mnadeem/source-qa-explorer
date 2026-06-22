import { existsSync } from 'node:fs';
import { mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { ReadableStream as NodeReadableStream } from 'node:stream/web';
import { createGunzip } from 'node:zlib';
import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as tar from 'tar';
import { REPO_CLONE_ROOT } from '@/shared/constants';
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
        createGunzip(),
        tar.extract({ cwd: target, strip: 1 }),
      );
    } catch (err) {
      await this.remove(sessionId).catch(() => undefined);
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
}
