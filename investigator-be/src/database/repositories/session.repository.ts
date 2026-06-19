import { Injectable } from '@nestjs/common';
import type { Prisma, Session } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class SessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  create(data: Prisma.SessionUncheckedCreateInput): Promise<Session> {
    return this.prisma.session.create({ data });
  }

  findById(id: string): Promise<Session | null> {
    return this.prisma.session.findUnique({ where: { id } });
  }

  touch(id: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: { updatedAt: new Date() },
    });
  }

  updateRepoPath(id: string, repoPath: string): Promise<Session> {
    return this.prisma.session.update({
      where: { id },
      data: { repoPath },
    });
  }
}
