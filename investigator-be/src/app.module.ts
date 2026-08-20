import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from '@/app.controller';
import { DatabaseModule } from '@/database/database.module';
import { LlmModule } from '@/llm/llm.module';
import { ReposModule } from '@/repos/repos.module';
import { CodeModule } from '@/code/code.module';
import { SessionsModule } from '@/sessions/sessions.module';
import { AgentModule } from '@/agent/agent.module';
import { AuditModule } from '@/audit/audit.module';
import { ChatModule } from '@/chat/chat.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
    }),
    ScheduleModule.forRoot(),
    // The endpoints here are unauthenticated and each one can trigger a repo
    // download or a multi-turn model conversation. Without a limit a single
    // client can exhaust both the disk and the model budget.
    ThrottlerModule.forRoot([
      { name: 'short', ttl: 60_000, limit: 20 },
      { name: 'long', ttl: 3_600_000, limit: 200 },
    ]),
    DatabaseModule,
    LlmModule,
    ReposModule,
    CodeModule,
    SessionsModule,
    AgentModule,
    AuditModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
