import { Module } from '@nestjs/common';
import { AgentModule } from '@/agent/agent.module';
import { CodeModule } from '@/code/code.module';
import { AuditChecker } from '@/audit/audit.checker';
import { AuditLlm } from '@/audit/audit.llm';
import { AuditService } from '@/audit/audit.service';

@Module({
  imports: [CodeModule, AgentModule],
  providers: [AuditChecker, AuditLlm, AuditService],
  exports: [AuditService],
})
export class AuditModule {}
