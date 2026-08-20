import { Module } from '@nestjs/common';
import { AgentModule } from '@/agent/agent.module';
import { AuditModule } from '@/audit/audit.module';
import { SessionsModule } from '@/sessions/sessions.module';
import { ChatService } from '@/chat/chat.service';

/**
 * The investigation pipeline on its own, with no HTTP surface.
 *
 * Kept separate from ChatModule so the background worker can depend on the
 * orchestration without pulling in the controller — which in turn depends on
 * the worker. Splitting the module is what keeps that a straight line instead
 * of a dependency cycle.
 */
@Module({
  imports: [SessionsModule, AgentModule, AuditModule],
  providers: [ChatService],
  exports: [ChatService],
})
export class ChatCoreModule {}
