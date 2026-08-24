import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ReposService } from '@/repos/repos.service';

/**
 * Periodically evicts cached repository clones.
 *
 * Each session downloads and extracts a repository into the clone root and
 * nothing removed it, so disk use grew monotonically until the container was
 * recycled. An hourly sweep bounds it against the TTL instead.
 */
@Injectable()
export class ReposCleanupService {
  private readonly logger = new Logger(ReposCleanupService.name);

  constructor(private readonly repos: ReposService) {}

  @Cron(CronExpression.EVERY_HOUR)
  async sweep(): Promise<void> {
    try {
      await this.repos.evictStale();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      this.logger.warn(`Repo cache sweep failed: ${message}`);
    }
  }
}
