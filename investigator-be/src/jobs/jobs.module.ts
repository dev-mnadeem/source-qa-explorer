import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { ChatCoreModule } from '@/chat/chat-core.module';
import { InvestigationWorker } from '@/jobs/investigation.worker';
import { JobRepository } from '@/jobs/job.repository';
import { JobsService } from '@/jobs/jobs.service';

@Module({
  imports: [ChatCoreModule],
  providers: [JobRepository, JobsService, InvestigationWorker],
  exports: [JobRepository, JobsService, InvestigationWorker],
})
export class JobsModule implements OnApplicationBootstrap {
  constructor(private readonly worker: InvestigationWorker) {}

  /**
   * Start polling only once the whole application is up, so the worker never
   * claims a job before the database and LLM provider are ready.
   */
  onApplicationBootstrap(): void {
    this.worker.start();
  }
}
