import { Global, Module } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { MessageRepository } from '@/database/repositories/message.repository';
import { SessionRepository } from '@/database/repositories/session.repository';

@Global()
@Module({
  providers: [PrismaService, SessionRepository, MessageRepository],
  exports: [PrismaService, SessionRepository, MessageRepository],
})
export class DatabaseModule {}
