import { Injectable } from '@nestjs/common';
import type { AuditVerdict, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class AuditVerdictRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.AuditVerdictUncheckedCreateInput): Promise<AuditVerdict> {
    return this.prisma.auditVerdict.create({ data });
  }

  findByMessageId(messageId: string): Promise<AuditVerdict | null> {
    return this.prisma.auditVerdict.findUnique({ where: { messageId } });
  }
}
