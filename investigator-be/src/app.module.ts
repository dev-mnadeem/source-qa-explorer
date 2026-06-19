import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '@/app.controller';
import { AppService } from '@/app.service';
import { DatabaseModule } from '@/database/database.module';
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
    DatabaseModule,
    ReposModule,
    CodeModule,
    SessionsModule,
    AgentModule,
    AuditModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
