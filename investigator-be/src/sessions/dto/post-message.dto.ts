import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class PostMessageDto {
  @ApiProperty({
    description: 'The user question to send to the investigator',
    example: 'How does authentication work in this codebase?',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  content!: string;
}
