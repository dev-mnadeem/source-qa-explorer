import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Subject } from 'rxjs';
import { ChatService } from '@/chat/chat.service';
import { JobRepository } from '@/jobs/job.repository';
import { ProgressEvent, nowIso } from '@/jobs/job.types';

const IDLE_POLL_MS = 400;

/**
 * Claims queued investigations and runs them off the request thread.
 *
 * Concurrency is bounded: an investigation is a long chain of model calls, and
 * letting an unbounded number run at once is the fastest route to both a
 * rate-limit wall at the vendor and an out-of-memory kill locally.
 *
 * Events are published twice — appended to the job row so a late or reconnecting
 * client can replay them, and pushed onto an in-process subject so an already
 * connected client sees them immediately.
 */
@Injectable()
export class InvestigationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(InvestigationWorker.name);
  private readonly concurrency: number;
  private readonly streams = new Map<string, Subject<ProgressEvent>>();
  private running = 0;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly jobs: JobRepository,
    private readonly chat: ChatService,
    config: ConfigService,
  ) {
    this.concurrency = Number(config.get('WORKER_CONCURRENCY') ?? 2);
  }

  /** Started explicitly from the module so tests can construct without a loop. */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), IDLE_POLL_MS);
    this.logger.log(
      `Investigation worker started (concurrency=${this.concurrency})`,
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    for (const subject of this.streams.values()) subject.complete();
    this.streams.clear();
  }

  /** Live event stream for one job. Callers must unsubscribe. */
  stream(jobId: string): Subject<ProgressEvent> {
    let subject = this.streams.get(jobId);
    if (!subject) {
      subject = new Subject<ProgressEvent>();
      this.streams.set(jobId, subject);
    }
    return subject;
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running >= this.concurrency) return;

    let job;
    try {
      job = await this.jobs.claimNext();
    } catch (err) {
      this.logger.error(
        `Failed to claim a job: ${err instanceof Error ? err.message : err}`,
      );
      return;
    }
    if (!job) return;

    this.running += 1;
    void this.run(job.id, job.sessionId, job.question).finally(() => {
      this.running -= 1;
    });
  }

  private async run(
    jobId: string,
    sessionId: string,
    question: string,
  ): Promise<void> {
    const emit = (event: ProgressEvent) => {
      // Persist first: an event the client never received is recoverable from
      // the row, but one that was only broadcast is lost on reconnect.
      void this.jobs.appendEvent(jobId, event).catch(() => undefined);
      this.streams.get(jobId)?.next(event);
    };

    emit({ type: 'started', at: nowIso() });

    try {
      const message = await this.chat.sendMessage(
        sessionId,
        question,
        (progress) => {
          switch (progress.kind) {
            case 'turn':
              emit({ type: 'turn', at: nowIso(), turn: progress.turn });
              break;
            case 'tool':
              emit({
                type: 'tool',
                at: nowIso(),
                name: progress.name,
                summary: progress.summary,
              });
              break;
            case 'answering':
              emit({ type: 'answering', at: nowIso() });
              break;
            case 'auditing':
              emit({ type: 'auditing', at: nowIso() });
              break;
          }
        },
      );

      await this.jobs.finish(jobId, 'succeeded', {
        resultMessageId: message.id,
      });
      emit({
        type: 'done',
        at: nowIso(),
        messageId: message.id,
        verdict: message.auditVerdict?.status ?? 'pending',
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Job ${jobId} failed: ${msg}`);
      await this.jobs
        .finish(jobId, 'failed', { error: msg })
        .catch(() => undefined);
      emit({ type: 'error', at: nowIso(), message: msg });
    } finally {
      // Let any attached SSE response close cleanly, then drop the subject so
      // the map does not grow for the lifetime of the process.
      const subject = this.streams.get(jobId);
      if (subject) {
        setTimeout(() => {
          subject.complete();
          this.streams.delete(jobId);
        }, 1000);
      }
    }
  }
}
