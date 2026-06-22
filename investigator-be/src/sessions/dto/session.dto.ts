import { ApiProperty } from '@nestjs/swagger';

export class SessionDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  githubUrl!: string;

  @ApiProperty()
  repoOwner!: string;

  @ApiProperty()
  repoName!: string;

  @ApiProperty()
  createdAt!: string;
}
