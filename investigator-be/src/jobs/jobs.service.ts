import { Injectable, NotFoundException } from '@nestjs/common';
import type { InvestigationJob } from '@prisma/client';
import {
  Observable,
  concatMap,
  exhaustMap,
  from,
  takeWhile,
  timer,
} from 'rxjs';
import { JobRepository } from '@/jobs/job.repository';
import { JobDto } from '@/jobs/dto/job.dto';
import { ProgressEvent, nowIso } from '@/jobs/job.types';

const EVENT_POLL_MS = 500;

const isTerminal = (event: ProgressEvent): boolean =>
  event.type === 'done' || event.type === 'error';

@Injectable()
export class JobsService {
  constructor(private readonly jobs: JobRepository) {}

  async getOrThrow(id: string): Promise<InvestigationJob> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
  }

  /**
   * Every event of a job, oldest first, completing after the terminal one.
   *
   * Reads the job row on an interval rather than subscribing to the worker in
   * this process. The in-process feed lost events emitted between the replay
   * read and the subscription, never completed for a job that finished in
   * that gap, and saw nothing at all when another instance ran the job.
   */
  followEvents(
    jobId: string,
    pollMs = EVENT_POLL_MS,
  ): Observable<ProgressEvent> {
    let delivered = 0;
    return timer(0, pollMs).pipe(
      exhaustMap(() => this.getOrThrow(jobId)),
      concatMap((job) => {
        const events = this.jobs.readEvents(job);
        const fresh = events.slice(delivered);
        delivered = events.length;
        const finished = job.status === 'succeeded' || job.status === 'failed';
        if (finished && !events.some(isTerminal)) {
          fresh.push(this.terminalEventFor(job));
        }
        return from(fresh);
      }),
      takeWhile((event) => !isTerminal(event), true),
    );
  }

  toDto(job: InvestigationJob): JobDto {
    return {
      id: job.id,
      sessionId: job.sessionId,
      status: job.status,
      question: job.question,
      resultMessageId: job.resultMessageId,
      error: job.error,
      events: this.jobs.readEvents(job),
      createdAt: job.createdAt.toISOString(),
    };
  }

  /** For rows finished without a recorded terminal event. */
  private terminalEventFor(job: InvestigationJob): ProgressEvent {
    if (job.status === 'succeeded' && job.resultMessageId) {
      return {
        type: 'done',
        at: job.updatedAt.toISOString(),
        messageId: job.resultMessageId,
        verdict: 'pending',
      };
    }
    return {
      type: 'error',
      at: nowIso(),
      message: job.error ?? 'The investigation ended without a result.',
    };
  }
}
