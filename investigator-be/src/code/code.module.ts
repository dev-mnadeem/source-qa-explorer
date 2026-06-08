import { Module } from '@nestjs/common';
import { CodeService } from '@/code/code.service';
import { RelevanceService } from '@/code/relevance.service';

@Module({
  providers: [CodeService, RelevanceService],
  exports: [CodeService, RelevanceService],
})
export class CodeModule {}
