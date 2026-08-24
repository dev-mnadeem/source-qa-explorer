import { ApiProperty } from '@nestjs/swagger';
import type { ProgressEvent } from '@/jobs/job.types';

export class JobDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  sessionId!: string;

  @ApiProperty({ enum: ['queued', 'running', 'succeeded', 'failed'] })
  status!: 'queued' | 'running' | 'succeeded' | 'failed';

  @ApiProperty()
  question!: string;

  @ApiProperty({
    required: false,
    nullable: true,
    description: 'Id of the assistant message, once the job has succeeded.',
  })
  resultMessageId!: string | null;

  @ApiProperty({ required: false, nullable: true })
  error!: string | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'Every progress event so far, oldest first.',
  })
  events!: ProgressEvent[];

  @ApiProperty()
  createdAt!: string;
}
