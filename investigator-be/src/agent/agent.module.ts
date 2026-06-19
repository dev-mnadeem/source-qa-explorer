import { Module } from '@nestjs/common';
import { CodeModule } from '@/code/code.module';
import { AnthropicProvider } from '@/common/providers/anthropic.provider';
import { AgentService } from '@/agent/agent.service';

@Module({
  imports: [CodeModule],
  providers: [AnthropicProvider, AgentService],
  exports: [AgentService, AnthropicProvider],
})
export class AgentModule {}
