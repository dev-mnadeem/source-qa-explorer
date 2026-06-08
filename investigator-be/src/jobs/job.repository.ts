import { Injectable } from '@nestjs/common';
import type { InvestigationJob, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';
import { ProgressEvent } from '@/jobs/job.types';

/**
 * How long a claimed job may run before another worker is allowed to take it.
 * Bounds the damage from a worker that is killed mid-investigation.
 */
const CLAIM_TIMEOUT_MS = 10 * 60 * 1000;

@Injectable()
export class JobRepository {
  constructor(private readonly prisma: PrismaService) {}

  enqueue(sessionId: string, question: string): Promise<InvestigationJob> {
    return this.prisma.investigationJob.create({
      data: { sessionId, question },
    });
  }

  findById(id: string): Promise<InvestigationJob | null> {
    return this.prisma.investigationJob.findUnique({ where: { id } });
  }

  /**
   * Atomically take the oldest runnable job.
   *
   * `FOR UPDATE SKIP LOCKED` is what makes this safe to run from several API
   * instances at once: each worker locks a different row instead of all of them
   * contending for the same head-of-queue record. Jobs whose claim has expired
   * are eligible again, so a crashed worker's work is picked up rather than
   * stranded.
   *
   * The UPDATE and the SELECT share one transaction, so a job can never be
   * observed as claimed by two workers.
   */
  async claimNext(now = new Date()): Promise<InvestigationJob | null> {
    const staleBefore = new Date(now.getTime() - CLAIM_TIMEOUT_MS);

    const rows = await this.prisma.$queryRaw<Array<{ id: string }>>`
      UPDATE investigation_jobs
      SET status = 'running',
          claimed_at = ${now},
          attempts = attempts + 1,
          updated_at = ${now}
      WHERE id = (
        SELECT id FROM investigation_jobs
        WHERE status = 'queued'
           OR (status = 'running' AND claimed_at < ${staleBefore})
        ORDER BY created_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      RETURNING id
    `;

    if (rows.length === 0) return null;
    return this.findById(rows[0].id);
  }

  /**
   * Appends a progress event.
   *
   * The concatenation happens inside Postgres rather than as read-modify-write
   * in Node, so two rapid events cannot clobber each other.
   */
  async appendEvent(id: string, event: ProgressEvent): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE investigation_jobs
      SET events = events || ${JSON.stringify([event])}::jsonb,
          updated_at = NOW()
      WHERE id = ${id}::uuid
    `;
  }

  async finish(
    id: string,
    status: Extract<JobStatus, 'succeeded' | 'failed'>,
    data: { resultMessageId?: string; error?: string },
  ): Promise<void> {
    await this.prisma.investigationJob.update({
      where: { id },
      data: {
        status,
        resultMessageId: data.resultMessageId ?? null,
        error: data.error ?? null,
      },
    });
  }

  listBySession(sessionId: string): Promise<InvestigationJob[]> {
    return this.prisma.investigationJob.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
    });
  }

  readEvents(job: InvestigationJob): ProgressEvent[] {
    return (job.events as Prisma.JsonArray as unknown as ProgressEvent[]) ?? [];
  }
}
