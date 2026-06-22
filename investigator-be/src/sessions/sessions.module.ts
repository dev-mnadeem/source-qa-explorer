import { Module } from '@nestjs/common';
import { ReposModule } from '@/repos/repos.module';
import { SessionsService } from '@/sessions/sessions.service';

@Module({
  imports: [ReposModule],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
