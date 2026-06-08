import { ConfigService } from '@nestjs/config';
import type { ChatService } from '@/chat/chat.service';
import type { AgentProgress } from '@/agent/agent.service';
import { InvestigationWorker } from '@/jobs/investigation.worker';
import { JobRepository } from '@/jobs/job.repository';
import { ProgressEvent } from '@/jobs/job.types';
import type { MessageDto } from '@/sessions/dto/message.dto';

type Runnable = {
  run(jobId: string, sessionId: string, question: string): Promise<void>;
  concurrency: number;
};

function setup(
  sendMessage: (
    sessionId: string,
    content: string,
    onProgress: (event: AgentProgress) => void,
  ) => Promise<MessageDto>,
) {
  const log: string[] = [];
  let calls = 0;
  const jobs = {
    // Early writes are slow, so unordered writes would land out of order.
    appendEvent: jest.fn(async (_id: string, event: ProgressEvent) => {
      const delay = Math.max(0, 20 - calls++ * 5);
      await new Promise((resolve) => setTimeout(resolve, delay));
      log.push(event.type);
    }),
    finish: jest.fn((_id: string, status: string) => {
      log.push(`finish:${status}`);
      return Promise.resolve();
    }),
  };
  const worker = new InvestigationWorker(
    jobs as unknown as JobRepository,
    { sendMessage } as unknown as ChatService,
    new ConfigService({}),
  );
  return { worker: worker as unknown as Runnable, jobs, log };
}

describe('InvestigationWorker', () => {
  it('records events in emission order, then marks the job succeeded', async () => {
    const { worker, log } = setup((_s, _c, onProgress) => {
      onProgress({ kind: 'turn', turn: 1 });
      onProgress({ kind: 'tool', name: 'list_dir', summary: 'list_dir(.)' });
      onProgress({ kind: 'auditing' });
      return Promise.resolve({
        id: 'm1',
        auditVerdict: { status: 'trusted' },
      } as MessageDto);
    });

    await worker.run('job-1', 'session-1', 'question');

    expect(log).toEqual([
      'started',
      'turn',
      'tool',
      'auditing',
      'done',
      'finish:succeeded',
    ]);
  });

  it('records the error event before marking the job failed', async () => {
    const { worker, log, jobs } = setup(() =>
      Promise.reject(new Error('model unavailable')),
    );

    await worker.run('job-1', 'session-1', 'question');

    expect(log).toEqual(['started', 'error', 'finish:failed']);
    expect(jobs.finish).toHaveBeenCalledWith('job-1', 'failed', {
      error: 'model unavailable',
    });
  });

  it('falls back to the default concurrency for a non-numeric setting', () => {
    const worker = new InvestigationWorker(
      {} as JobRepository,
      {} as ChatService,
      new ConfigService({ WORKER_CONCURRENCY: 'two' }),
    ) as unknown as Runnable;
    expect(worker.concurrency).toBe(2);
  });
});
