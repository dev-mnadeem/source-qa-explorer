import { Injectable, NotFoundException } from '@nestjs/common';
import type { InvestigationJob } from '@prisma/client';
import { JobRepository } from '@/jobs/job.repository';
import { JobDto } from '@/jobs/dto/job.dto';

@Injectable()
export class JobsService {
  constructor(private readonly jobs: JobRepository) {}

  async getOrThrow(id: string): Promise<InvestigationJob> {
    const job = await this.jobs.findById(id);
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return job;
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
}
