import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CreateSessionDto } from '@/sessions/dto/create-session.dto';
import { MessageDto } from '@/sessions/dto/message.dto';
import { PostMessageDto } from '@/sessions/dto/post-message.dto';
import { SessionDto } from '@/sessions/dto/session.dto';
import { SessionsService } from '@/sessions/sessions.service';
import { ChatService } from '@/chat/chat.service';

@ApiTags('Chat')
@Controller('sessions')
export class ChatController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly chatService: ChatService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Start a new investigation session by cloning a public GitHub repo',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse({ description: 'Invalid GitHub URL or clone failure' })
  create(@Body() dto: CreateSessionDto): Promise<SessionDto> {
    return this.sessionsService.create(dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session metadata' })
  @ApiOkResponse({ type: SessionDto })
  @ApiNotFoundResponse()
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<SessionDto> {
    return this.sessionsService.getSessionDto(id);
  }

  @Get(':id/messages')
  @ApiOperation({ summary: 'List the conversation messages for a session' })
  @ApiOkResponse({ type: MessageDto, isArray: true })
  @ApiNotFoundResponse()
  listMessages(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MessageDto[]> {
    return this.sessionsService.listMessages(id);
  }

  @Post(':id/messages')
  @ApiOperation({
    summary:
      'Send a user question to the investigator. Returns the assistant message with citations and audit verdict.',
  })
  @ApiCreatedResponse({ type: MessageDto })
  @ApiNotFoundResponse()
  sendMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PostMessageDto,
  ): Promise<MessageDto> {
    return this.chatService.sendMessage(id, dto.content);
  }
}
