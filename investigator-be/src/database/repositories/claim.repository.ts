import { Injectable } from '@nestjs/common';
import type { Claim, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class ClaimRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(rows: Prisma.ClaimUncheckedCreateInput[]): Promise<Claim[]> {
    if (rows.length === 0) return Promise.resolve([]);
    return this.prisma.$transaction(
      rows.map((data) => this.prisma.claim.create({ data })),
    );
  }

  listBySession(sessionId: string): Promise<Claim[]> {
    return this.prisma.claim.findMany({
      where: { message: { sessionId } },
      orderBy: { createdAt: 'asc' },
    });
  }
}
