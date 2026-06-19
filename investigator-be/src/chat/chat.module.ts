import { Module } from '@nestjs/common';
import { AgentModule } from '@/agent/agent.module';
import { AuditModule } from '@/audit/audit.module';
import { SessionsModule } from '@/sessions/sessions.module';
import { ChatController } from '@/chat/chat.controller';
import { ChatService } from '@/chat/chat.service';

@Module({
  imports: [SessionsModule, AgentModule, AuditModule],
  controllers: [ChatController],
  providers: [ChatService],
})
export class ChatModule {}
