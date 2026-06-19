import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { AuditVerdictRepository } from '@/database/repositories/audit-verdict.repository';
import { CitationRepository } from '@/database/repositories/citation.repository';
import { ClaimRepository } from '@/database/repositories/claim.repository';
import { MessageRepository } from '@/database/repositories/message.repository';
import { SessionRepository } from '@/database/repositories/session.repository';

@Global()
@Module({
  providers: [
    PrismaService,
    SessionRepository,
    MessageRepository,
    CitationRepository,
    ClaimRepository,
    AuditVerdictRepository,
  ],
  exports: [
    PrismaService,
    SessionRepository,
    MessageRepository,
    CitationRepository,
    ClaimRepository,
    AuditVerdictRepository,
  ],
})
export class DatabaseModule {}
