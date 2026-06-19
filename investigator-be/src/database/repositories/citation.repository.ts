import { Injectable } from '@nestjs/common';
import type { Citation, Prisma } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class CitationRepository {
  constructor(private readonly prisma: PrismaService) {}

  createMany(
    rows: Prisma.CitationUncheckedCreateInput[],
  ): Promise<Citation[]> {
    if (rows.length === 0) return Promise.resolve([]);
    return this.prisma.$transaction(
      rows.map((data) => this.prisma.citation.create({ data })),
    );
  }

  setVerified(id: string, verified: boolean): Promise<Citation> {
    return this.prisma.citation.update({
      where: { id },
      data: { verified },
    });
  }
}
