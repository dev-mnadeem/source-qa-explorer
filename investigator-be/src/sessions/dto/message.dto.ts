import { ApiProperty } from '@nestjs/swagger';

export class CitationDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  filePath!: string;

  @ApiProperty()
  lineStart!: number;

  @ApiProperty()
  lineEnd!: number;

  @ApiProperty({ required: false, nullable: true })
  excerpt!: string | null;

  @ApiProperty()
  verified!: boolean;
}

export class AuditVerdictDto {
  @ApiProperty({ enum: ['trusted', 'partial', 'suspect', 'pending'] })
  status!: 'trusted' | 'partial' | 'suspect' | 'pending';

  @ApiProperty()
  programmaticPass!: boolean;

  @ApiProperty({ required: false, nullable: true })
  programmaticNotes!: string | null;

  @ApiProperty({ enum: ['trusted', 'partial', 'suspect', 'pending'] })
  llmStatus!: 'trusted' | 'partial' | 'suspect' | 'pending';

  @ApiProperty()
  llmReasons!: string;
}

export type ToolCallRecord = {
  name: string;
  input: Record<string, unknown>;
  resultSummary: string;
};

export class MessageDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ enum: ['user', 'assistant'] })
  role!: 'user' | 'assistant';

  @ApiProperty()
  content!: string;

  @ApiProperty({ type: () => [CitationDto] })
  citations!: CitationDto[];

  @ApiProperty({ required: false, nullable: true })
  auditVerdict!: AuditVerdictDto | null;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    required: false,
    nullable: true,
  })
  toolCalls!: ToolCallRecord[] | null;

  @ApiProperty()
  createdAt!: string;
}
