import { Module } from '@nestjs/common';
import { JobsModule } from '@/jobs/jobs.module';
import { SessionsModule } from '@/sessions/sessions.module';
import { ChatController } from '@/chat/chat.controller';

@Module({
  imports: [SessionsModule, JobsModule],
  controllers: [ChatController],
})
export class ChatModule {}
