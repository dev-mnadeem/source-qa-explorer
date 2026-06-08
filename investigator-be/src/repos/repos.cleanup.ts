import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { ReposService } from '@/repos/repos.service';

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Periodically evicts cached repository clones.
 *
 * Each session downloads and extracts a repository into the clone root and
 * nothing removed it, so disk use grew monotonically until the container was
 * recycled. An hourly sweep bounds it against the TTL instead.
 */
@Injectable()
export class ReposCleanupService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(ReposCleanupService.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly repos: ReposService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    // The sweep alone must not keep the process alive.
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async sweep(): Promise<void> {
    try {
      await this.repos.evictStale();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Repo cache sweep failed: ${message}`);
    }
  }
}
