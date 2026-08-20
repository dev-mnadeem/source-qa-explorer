import { Module } from '@nestjs/common';
import { CodeModule } from '@/code/code.module';
import { AgentService } from '@/agent/agent.service';

@Module({
  imports: [CodeModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
