import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ChatService } from '@/chat/chat.service';
import { JobRepository } from '@/jobs/job.repository';
import { ProgressEvent, nowIso } from '@/jobs/job.types';

const IDLE_POLL_MS = 400;
const DEFAULT_CONCURRENCY = 2;

/**
 * Claims queued investigations and runs them off the request thread.
 *
 * Concurrency is bounded: an investigation is a long chain of model calls, and
 * letting an unbounded number run at once is the fastest route to both a
 * rate-limit wall at the vendor and an out-of-memory kill locally.
 *
 * Progress is appended to the job row, which is what SSE clients read. Keeping
 * the row as the only channel means a client connected to a different API
 * instance than the worker still sees every event.
 */
@Injectable()
export class InvestigationWorker implements OnModuleDestroy {
  private readonly logger = new Logger(InvestigationWorker.name);
  private readonly concurrency: number;
  private running = 0;
  private stopped = false;
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly jobs: JobRepository,
    private readonly chat: ChatService,
    config: ConfigService,
  ) {
    // A typo here used to yield NaN, and `running >= NaN` is never true, so
    // the worker claimed every queued job at once.
    const configured = Number(config.get('WORKER_CONCURRENCY'));
    this.concurrency =
      Number.isInteger(configured) && configured > 0
        ? configured
        : DEFAULT_CONCURRENCY;
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
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running >= this.concurrency) return;

    // Reserve the slot before the await, or several ticks can pass the check
    // above while the claim query is still in flight.
    this.running += 1;
    let job;
    try {
      job = await this.jobs.claimNext();
    } catch (err) {
      this.logger.error(
        `Failed to claim a job: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!job) {
      this.running -= 1;
      return;
    }

    void this.run(job.id, job.sessionId, job.question).finally(() => {
      this.running -= 1;
    });
  }

  private async run(
    jobId: string,
    sessionId: string,
    question: string,
  ): Promise<void> {
    // Writes are chained so they land in the order they were emitted. Fired
    // independently, two UPDATEs on the pool can commit out of order and the
    // client's trace shows a tool call after "done".
    let writes = Promise.resolve();
    const emit = (event: ProgressEvent) => {
      writes = writes
        .then(() => this.jobs.appendEvent(jobId, event))
        .catch((err: unknown) => {
          this.logger.warn(
            `Job ${jobId}: could not record ${event.type} event: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
    };

    emit({ type: 'started', at: nowIso() });

    let outcome:
      | { status: 'succeeded'; messageId: string; verdict: string }
      | { status: 'failed'; error: string };
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
      outcome = {
        status: 'succeeded',
        messageId: message.id,
        verdict: message.auditVerdict?.status ?? 'pending',
      };
    } catch (err) {
      const error = err instanceof Error ? err.message : 'unknown error';
      this.logger.error(`Job ${jobId} failed: ${error}`);
      outcome = { status: 'failed', error };
    }

    // The terminal event is written before the status flips, so a reader that
    // sees a finished job has already been able to read how it finished.
    emit(
      outcome.status === 'succeeded'
        ? {
            type: 'done',
            at: nowIso(),
            messageId: outcome.messageId,
            verdict: outcome.verdict,
          }
        : { type: 'error', at: nowIso(), message: outcome.error },
    );
    await writes;

    try {
      await this.jobs.finish(
        jobId,
        outcome.status,
        outcome.status === 'succeeded'
          ? { resultMessageId: outcome.messageId }
          : { error: outcome.error },
      );
    } catch (err) {
      this.logger.error(
        `Job ${jobId}: could not record completion: ${
          err instanceof Error ? err.message : err
        }`,
      );
    }
  }
}
