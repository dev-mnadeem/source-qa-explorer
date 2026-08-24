import { Module } from '@nestjs/common';
import { ReposCleanupService } from '@/repos/repos.cleanup';
import { ReposService } from '@/repos/repos.service';

@Module({
  providers: [ReposService, ReposCleanupService],
  exports: [ReposService],
})
export class ReposModule {}
