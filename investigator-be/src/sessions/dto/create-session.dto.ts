import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUrl } from 'class-validator';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Public GitHub repository URL to investigate',
    example: 'https://github.com/anthropics/courses',
  })
  @IsString()
  @IsUrl()
  githubUrl!: string;
}
