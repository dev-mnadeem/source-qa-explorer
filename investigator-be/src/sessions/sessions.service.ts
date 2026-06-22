import { existsSync } from 'node:fs';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { AuditVerdict, Citation, Message, Session } from '@prisma/client';
import { AuditVerdictRepository } from '@/database/repositories/audit-verdict.repository';
import { MessageRepository } from '@/database/repositories/message.repository';
import { SessionRepository } from '@/database/repositories/session.repository';
import { ReposService } from '@/repos/repos.service';
import { CreateSessionDto } from '@/sessions/dto/create-session.dto';
import {
  AuditVerdictDto,
  CitationDto,
  MessageDto,
  ToolCallRecord,
} from '@/sessions/dto/message.dto';
import { SessionDto } from '@/sessions/dto/session.dto';

@Injectable()
export class SessionsService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly messageRepo: MessageRepository,
    private readonly auditRepo: AuditVerdictRepository,
    private readonly reposService: ReposService,
  ) {}

  async create(dto: CreateSessionDto): Promise<SessionDto> {
    const parsed = this.reposService.parseGithubUrl(dto.githubUrl);
    // Reserve the row first so we have a stable id to use as the clone path.
    const session = await this.sessionRepo.create({
      githubUrl: parsed.webUrl,
      repoOwner: parsed.owner,
      repoName: parsed.name,
      repoPath: '',
    });
    const repoPath = await this.reposService.clone(session.id, parsed);
    const updated = await this.sessionRepo.updateRepoPath(session.id, repoPath);
    return this.toDto(updated);
  }

  async getOrThrow(id: string): Promise<Session> {
    const session = await this.sessionRepo.findById(id);
    if (!session) throw new NotFoundException(`Session ${id} not found`);
    // If the cloned dir was wiped (e.g. /tmp cleanup or process restart), re-clone.
    if (!session.repoPath || !existsSync(session.repoPath)) {
      const parsed = this.reposService.parseGithubUrl(session.githubUrl);
      const repoPath = await this.reposService.clone(session.id, parsed);
      return this.sessionRepo.updateRepoPath(session.id, repoPath);
    }
    return session;
  }

  async getSessionDto(id: string): Promise<SessionDto> {
    const session = await this.getOrThrow(id);
    return this.toDto(session);
  }

  async listMessages(sessionId: string): Promise<MessageDto[]> {
    await this.getOrThrow(sessionId);
    const rows = await this.messageRepo.listBySession(sessionId);
    return rows.map((row) =>
      this.messageToDto(row, row.citations, row.auditVerdict),
    );
  }

  toDto(session: Session): SessionDto {
    return {
      id: session.id,
      githubUrl: session.githubUrl,
      repoOwner: session.repoOwner,
      repoName: session.repoName,
      createdAt: session.createdAt.toISOString(),
    };
  }

  messageToDto(
    message: Message,
    citations: Citation[],
    auditVerdict: AuditVerdict | null,
  ): MessageDto {
    return {
      id: message.id,
      role: message.role,
      content: message.content,
      citations: citations.map((c) => this.citationToDto(c)),
      auditVerdict: auditVerdict ? this.auditVerdictToDto(auditVerdict) : null,
      toolCalls: (message.toolCalls as ToolCallRecord[] | null) ?? null,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private citationToDto(citation: Citation): CitationDto {
    return {
      id: citation.id,
      filePath: citation.filePath,
      lineStart: citation.lineStart,
      lineEnd: citation.lineEnd,
      excerpt: citation.excerpt,
      verified: citation.verified,
    };
  }

  private auditVerdictToDto(verdict: AuditVerdict): AuditVerdictDto {
    return {
      status: verdict.status,
      programmaticPass: verdict.programmaticPass,
      programmaticNotes: verdict.programmaticNotes,
      llmStatus: verdict.llmStatus,
      llmReasons: verdict.llmReasons,
    };
  }
}
