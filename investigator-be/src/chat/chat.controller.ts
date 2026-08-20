import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Sse,
} from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { Observable, concat, from, takeWhile } from 'rxjs';
import { map } from 'rxjs/operators';
import { CreateSessionDto } from '@/sessions/dto/create-session.dto';
import { MessageDto } from '@/sessions/dto/message.dto';
import { PostMessageDto } from '@/sessions/dto/post-message.dto';
import { SessionDto } from '@/sessions/dto/session.dto';
import { SessionsService } from '@/sessions/sessions.service';
import { JobDto } from '@/jobs/dto/job.dto';
import { JobRepository } from '@/jobs/job.repository';
import { JobsService } from '@/jobs/jobs.service';
import { InvestigationWorker } from '@/jobs/investigation.worker';
import { ProgressEvent } from '@/jobs/job.types';

@ApiTags('Chat')
@Controller()
export class ChatController {
  constructor(
    private readonly sessionsService: SessionsService,
    private readonly jobRepo: JobRepository,
    private readonly jobsService: JobsService,
    private readonly worker: InvestigationWorker,
  ) {}

  @Post('sessions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary:
      'Start a new investigation session by cloning a public GitHub repo',
  })
  @ApiCreatedResponse({ type: SessionDto })
  @ApiBadRequestResponse({ description: 'Invalid GitHub URL or clone failure' })
  create(@Body() dto: CreateSessionDto): Promise<SessionDto> {
    return this.sessionsService.create(dto);
  }

  @Get('sessions/:id')
  @ApiOperation({ summary: 'Get session metadata' })
  @ApiOkResponse({ type: SessionDto })
  @ApiNotFoundResponse()
  get(@Param('id', new ParseUUIDPipe()) id: string): Promise<SessionDto> {
    return this.sessionsService.getSessionDto(id);
  }

  @Get('sessions/:id/messages')
  @ApiOperation({ summary: 'List the conversation messages for a session' })
  @ApiOkResponse({ type: MessageDto, isArray: true })
  @ApiNotFoundResponse()
  listMessages(
    @Param('id', new ParseUUIDPipe()) id: string,
  ): Promise<MessageDto[]> {
    return this.sessionsService.listMessages(id);
  }

  /**
   * Enqueues an investigation and returns immediately.
   *
   * This used to run the whole agent loop inline and respond with the finished
   * message. A live model needs several round-trips plus an audit pass, which
   * regularly exceeds the 30–60s idle timeout of any proxy in front of the
   * service, so the request died while the work continued invisibly. Now the
   * request only enqueues; progress arrives on the SSE stream below.
   */
  @Post('sessions/:id/messages')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Queue a question. Returns a job; follow it on /jobs/:id/events.',
  })
  @ApiAcceptedResponse({ type: JobDto })
  @ApiNotFoundResponse()
  async sendMessage(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: PostMessageDto,
  ): Promise<JobDto> {
    // Resolves the session (and re-clones it if the checkout was evicted)
    // before queueing, so a bad session id fails here rather than inside a job.
    await this.sessionsService.getOrThrow(id);
    const job = await this.jobRepo.enqueue(id, dto.content);
    return this.jobsService.toDto(job);
  }

  @Get('jobs/:jobId')
  @ApiOperation({ summary: 'Poll a job. Use the SSE stream where possible.' })
  @ApiOkResponse({ type: JobDto })
  @ApiNotFoundResponse()
  async getJob(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ): Promise<JobDto> {
    return this.jobsService.toDto(await this.jobsService.getOrThrow(jobId));
  }

  /**
   * Server-sent events for one job.
   *
   * Replays everything already recorded before attaching to the live feed, so a
   * client that connects late — or reconnects after a dropped connection — sees
   * the full history rather than joining mid-investigation.
   */
  @Sse('jobs/:jobId/events')
  @ApiOperation({ summary: 'Stream investigation progress as it happens' })
  @ApiProduces('text/event-stream')
  async events(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
  ): Promise<Observable<{ data: ProgressEvent }>> {
    const job = await this.jobsService.getOrThrow(jobId);
    const replay = this.jobRepo.readEvents(job);

    // A finished job needs no live feed; replay and close.
    if (job.status === 'succeeded' || job.status === 'failed') {
      return from([...replay]).pipe(map((data) => ({ data })));
    }

    return concat(from(replay), this.worker.stream(jobId)).pipe(
      // Close the stream after the terminal event so the browser's EventSource
      // does not immediately reconnect to a completed job.
      takeWhile(
        (event) => event.type !== 'done' && event.type !== 'error',
        true,
      ),
      map((data) => ({ data })),
    );
  }
}
