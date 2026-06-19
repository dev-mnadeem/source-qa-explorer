import { Module } from '@nestjs/common';
import { CodeService } from '@/code/code.service';

@Module({
  providers: [CodeService],
  exports: [CodeService],
})
export class CodeModule {}
