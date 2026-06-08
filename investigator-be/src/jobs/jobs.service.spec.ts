import type { InvestigationJob } from '@prisma/client';
import { lastValueFrom, toArray } from 'rxjs';
import { JobRepository } from '@/jobs/job.repository';
import { JobsService } from '@/jobs/jobs.service';
import { ProgressEvent } from '@/jobs/job.types';

const at = '2026-01-01T00:00:00.000Z';

function job(
  status: InvestigationJob['status'],
  events: ProgressEvent[],
  extra: Partial<InvestigationJob> = {},
): InvestigationJob {
  return {
    id: 'job-1',
    sessionId: 'session-1',
    question: 'q',
    status,
    events,
    resultMessageId: null,
    error: null,
    attempts: 1,
    claimedAt: null,
    createdAt: new Date(at),
    updatedAt: new Date(at),
    ...extra,
  };
}

/** A repository whose row moves through the given states, one per read. */
function serviceReading(states: InvestigationJob[]): JobsService {
  let read = 0;
  const repo = {
    findById: jest.fn(() =>
      Promise.resolve(states[Math.min(read++, states.length - 1)]),
    ),
    readEvents: (row: InvestigationJob) =>
      row.events as unknown as ProgressEvent[],
  };
  return new JobsService(repo as unknown as JobRepository);
}

describe('JobsService.followEvents', () => {
  it('streams each event once, in order, and completes on done', async () => {
    const started: ProgressEvent = { type: 'started', at };
    const turn: ProgressEvent = { type: 'turn', at, turn: 1 };
    const done: ProgressEvent = {
      type: 'done',
      at,
      messageId: 'm1',
      verdict: 'trusted',
    };
    const service = serviceReading([
      job('running', [started]),
      job('running', [started]),
      job('running', [started, turn]),
      job('running', [started, turn, done]),
    ]);

    const events = await lastValueFrom(
      service.followEvents('job-1', 1).pipe(toArray()),
    );

    expect(events.map((e) => e.type)).toEqual(['started', 'turn', 'done']);
  });

  it('replays a finished job and closes without polling again', async () => {
    const service = serviceReading([
      job('failed', [
        { type: 'started', at },
        { type: 'error', at, message: 'boom' },
      ]),
    ]);

    const events = await lastValueFrom(
      service.followEvents('job-1', 1).pipe(toArray()),
    );

    expect(events).toEqual([
      { type: 'started', at },
      { type: 'error', at, message: 'boom' },
    ]);
  });

  it('closes a finished job whose terminal event was never recorded', async () => {
    const service = serviceReading([
      job('failed', [{ type: 'started', at }], { error: 'worker crashed' }),
    ]);

    const events = await lastValueFrom(
      service.followEvents('job-1', 1).pipe(toArray()),
    );

    expect(events[events.length - 1]).toMatchObject({
      type: 'error',
      message: 'worker crashed',
    });
  });
});
