import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentService } from '@/agent/agent.service';
import {
  CitationInput,
  ToolCallRecord,
} from '@/agent/dto/agent-result.dto';
import { AuditService } from '@/audit/audit.service';
import { CitationRepository } from '@/database/repositories/citation.repository';
import { MessageRepository } from '@/database/repositories/message.repository';
import { AuditVerdictRepository } from '@/database/repositories/audit-verdict.repository';
import { MessageDto } from '@/sessions/dto/message.dto';
import { SessionsService } from '@/sessions/sessions.service';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly agentService: AgentService,
    private readonly auditService: AuditService,
    private readonly messageRepo: MessageRepository,
    private readonly citationRepo: CitationRepository,
    private readonly auditVerdictRepo: AuditVerdictRepository,
  ) {}

  async sendMessage(
    sessionId: string,
    content: string,
  ): Promise<MessageDto> {
    const session = await this.sessionsService.getOrThrow(sessionId);
    const repoLabel = `${session.repoOwner}/${session.repoName}`;

    // 1. Persist the user message first.
    const userMessage = await this.messageRepo.create({
      sessionId,
      role: 'user',
      content,
    });

    // 2. Build conversation history from prior turns (excluding this one).
    const priorMessages = await this.messageRepo.listBySession(sessionId);
    const history = this.buildAgentHistory(
      priorMessages.filter((m) => m.id !== userMessage.id),
    );

    // 3. Run the investigator.
    const agentResult = await this.agentService.investigate({
      repoRoot: session.repoPath,
      repoLabel,
      history,
      userMessage: content,
    });

    // 4. Run the independent audit.
    const audit = await this.auditService.run({
      repoRoot: session.repoPath,
      question: content,
      answer: agentResult.answer,
      citations: agentResult.citations,
    });

    // 5. Persist the assistant message + citations + verdict.
    const assistantMessage = await this.messageRepo.create({
      sessionId,
      role: 'assistant',
      content: agentResult.answer,
      toolCalls: this.toJsonValue(agentResult.toolCalls),
    });

    const citationRows = await this.citationRepo.createMany(
      this.buildCitationRows(
        assistantMessage.id,
        agentResult.citations,
        audit.programmatic.perCitation,
      ),
    );

    const verdict = await this.auditVerdictRepo.create({
      messageId: assistantMessage.id,
      status: audit.status,
      programmaticPass: audit.programmatic.pass,
      programmaticNotes: audit.programmatic.notes,
      llmStatus: audit.llm.status,
      llmReasons: audit.llm.reasons,
    });

    return this.sessionsService.messageToDto(
      assistantMessage,
      citationRows,
      verdict,
    );
  }

  // ------------------------------------------------------------------

  /**
   * Convert persisted messages into Anthropic message params for the agent.
   * For multi-turn coherence we include each prior user question and the final
   * assistant answer text. We do NOT replay tool_use/tool_result blocks — those
   * were ephemeral to a previous turn and would bloat context unnecessarily.
   * Citations are injected inline so the model can stay consistent with its
   * own prior factual claims.
   */
  private buildAgentHistory(
    messages: Awaited<ReturnType<MessageRepository['listBySession']>>,
  ): Anthropic.MessageParam[] {
    const history: Anthropic.MessageParam[] = [];
    for (const m of messages) {
      if (m.role === 'user') {
        history.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const cited = m.citations
          .map(
            (c) =>
              `${c.filePath}:${c.lineStart}-${c.lineEnd}${c.verified ? '' : ' (UNVERIFIED)'}`,
          )
          .join(', ');
        const suffix = cited
          ? `\n\n[Prior citations: ${cited}]`
          : '';
        history.push({
          role: 'assistant',
          content: `${m.content}${suffix}`,
        });
      }
    }
    return history;
  }

  private buildCitationRows(
    messageId: string,
    citations: CitationInput[],
    perCitation: Array<{
      citation: CitationInput;
      verified: boolean;
      excerpt?: string;
    }>,
  ): Prisma.CitationUncheckedCreateInput[] {
    return citations.map((c, idx) => {
      const matched = perCitation[idx];
      return {
        messageId,
        filePath: c.filePath,
        lineStart: c.lineStart,
        lineEnd: c.lineEnd,
        excerpt: matched?.excerpt ?? null,
        verified: matched?.verified ?? false,
      };
    });
  }

  private toJsonValue(toolCalls: ToolCallRecord[]): Prisma.InputJsonValue {
    return toolCalls as unknown as Prisma.InputJsonValue;
  }
}
