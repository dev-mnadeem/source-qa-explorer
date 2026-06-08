import { Controller, Get, Inject } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '@/database/prisma.service';
import type { LlmProvider } from '@/llm/llm.types';
import { LLM_PROVIDER } from '@/llm/llm.types';

class HealthDto {
  status!: 'ok' | 'degraded';
  database!: 'up' | 'down';
  llmProvider!: string;
  llmMode!: 'live' | 'offline';
  uptimeSeconds!: number;
}

@ApiTags('Health')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider,
  ) {}

  /**
   * Readiness probe. Actually round-trips the database rather than returning a
   * constant, so a container with a broken connection string is reported as
   * degraded instead of being routed traffic.
   */
  @Get('health')
  @ApiOperation({ summary: 'Service health, database connectivity, LLM mode' })
  @ApiOkResponse({ type: HealthDto })
  async getHealth(): Promise<HealthDto> {
    let database: 'up' | 'down' = 'down';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      database = 'up';
    } catch {
      database = 'down';
    }

    return {
      status: database === 'up' ? 'ok' : 'degraded',
      database,
      llmProvider: this.llm.name,
      llmMode: this.llm.isLive ? 'live' : 'offline',
      uptimeSeconds: Math.round(process.uptime()),
    };
  }
}
