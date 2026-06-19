import { Injectable } from '@nestjs/common';
import type { Message, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

export type MessageWithRelations = Prisma.MessageGetPayload<{
  include: { citations: true; auditVerdict: true };
}>;

@Injectable()
export class MessageRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.MessageUncheckedCreateInput): Promise<Message> {
    return this.prisma.message.create({ data });
  }

  listBySession(sessionId: string): Promise<MessageWithRelations[]> {
    return this.prisma.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      include: { citations: true, auditVerdict: true },
    });
  }

  findById(id: string): Promise<MessageWithRelations | null> {
    return this.prisma.message.findUnique({
      where: { id },
      include: { citations: true, auditVerdict: true },
    });
  }
}
