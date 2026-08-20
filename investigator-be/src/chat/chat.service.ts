import type Anthropic from '@anthropic-ai/sdk';
import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AgentProgress, AgentService } from '@/agent/agent.service';
import { CitationInput, ToolCallRecord } from '@/agent/dto/agent-result.dto';
import { AuditService } from '@/audit/audit.service';
import { PrismaService } from '@/database/prisma.service';
import { MessageRepository } from '@/database/repositories/message.repository';
import { MessageDto } from '@/sessions/dto/message.dto';
import { SessionsService } from '@/sessions/sessions.service';
import { MAX_HISTORY_MESSAGES } from '@/shared/constants';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);

  constructor(
    private readonly sessionsService: SessionsService,
    private readonly agentService: AgentService,
    private readonly auditService: AuditService,
    private readonly messageRepo: MessageRepository,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Runs one full investigation: agent loop, audit, persist.
   *
   * Called by the background worker rather than from the request thread — a
   * multi-turn conversation with a live model routinely outlives an HTTP
   * request, and previously this ran inline and timed out behind any proxy.
   */
  async sendMessage(
    sessionId: string,
    content: string,
    onProgress?: (event: AgentProgress) => void,
  ): Promise<MessageDto> {
    const session = await this.sessionsService.getOrThrow(sessionId);
    const repoLabel = `${session.repoOwner}/${session.repoName}`;
    const startedAt = Date.now();

    // 1. Persist the user message first, so a crash mid-investigation still
    //    leaves a record of what was asked.
    const userMessage = await this.messageRepo.create({
      sessionId,
      role: 'user',
      content,
    });

    // 2. Replay a bounded window of prior turns.
    const priorMessages = await this.messageRepo.listBySession(sessionId);
    const history = this.buildAgentHistory(
      priorMessages.filter((m) => m.id !== userMessage.id),
    );

    // 3. Investigate, then 4. audit the result independently.
    const agentResult = await this.agentService.investigate({
      repoRoot: session.repoPath,
      repoLabel,
      history,
      userMessage: content,
      onProgress,
    });

    onProgress?.({ kind: 'auditing' });
    const audit = await this.auditService.run({
      repoRoot: session.repoPath,
      question: content,
      answer: agentResult.answer,
      citations: agentResult.citations,
      priorCosts: agentResult.costs,
    });

    // 5. Persist the answer, its citations and its verdict as one unit.
    //
    //    These were three independent writes. A failure between them left an
    //    assistant message with no citations and no verdict — which the UI
    //    renders as an unaudited answer, the exact failure mode this project
    //    exists to prevent. One transaction: all three, or none.
    const assistantMessage = await this.prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          sessionId,
          role: 'assistant',
          content: agentResult.answer,
          toolCalls: this.toJsonValue(agentResult.toolCalls),
        },
      });

      if (agentResult.citations.length > 0) {
        await tx.citation.createMany({
          data: this.buildCitationRows(
            message.id,
            agentResult.citations,
            audit.programmatic.perCitation,
          ),
        });
      }

      await tx.auditVerdict.create({
        data: {
          messageId: message.id,
          status: audit.status,
          programmaticPass: audit.programmatic.pass,
          programmaticNotes: audit.programmatic.notes,
          llmStatus: audit.llm.status,
          llmReasons: audit.llm.reasons,
        },
      });

      return tx.message.findUniqueOrThrow({
        where: { id: message.id },
        include: { citations: true, auditVerdict: true },
      });
    });

    this.logger.log(
      `session=${sessionId} verdict=${audit.status} ` +
        `citations=${agentResult.citations.length} ` +
        `tools=${agentResult.toolCalls.length} ` +
        `tokens=${audit.cost.inputTokens}in/${audit.cost.outputTokens}out ` +
        `usd=${audit.cost.usd} ms=${Date.now() - startedAt}`,
    );

    return this.sessionsService.messageToDto(
      assistantMessage,
      assistantMessage.citations,
      assistantMessage.auditVerdict,
      audit.cost,
    );
  }

  // ------------------------------------------------------------------

  /**
   * Convert persisted messages into Anthropic message params for the agent.
   *
   * Only the most recent MAX_HISTORY_MESSAGES turns are replayed. Previously
   * every turn was replayed forever, so prompt size — and with it latency,
   * cost and the risk of blowing the context window — grew without bound over
   * a long session. Truncation is oldest-first so the immediate context, which
   * is what follow-up questions depend on, always survives.
   *
   * Tool_use / tool_result blocks are still omitted: they were ephemeral to a
   * previous turn. Citations are inlined so the model stays consistent with
   * its own prior factual claims.
   */
  private buildAgentHistory(
    messages: Awaited<ReturnType<MessageRepository['listBySession']>>,
  ): Anthropic.MessageParam[] {
    const recent = messages.slice(-MAX_HISTORY_MESSAGES);
    if (messages.length > recent.length) {
      this.logger.debug(
        `Truncated history from ${messages.length} to ${recent.length} messages`,
      );
    }

    const history: Anthropic.MessageParam[] = [];
    for (const m of recent) {
      if (m.role === 'user') {
        history.push({ role: 'user', content: m.content });
      } else if (m.role === 'assistant') {
        const cited = m.citations
          .map(
            (c) =>
              `${c.filePath}:${c.lineStart}-${c.lineEnd}${c.verified ? '' : ' (UNVERIFIED)'}`,
          )
          .join(', ');
        const suffix = cited ? `\n\n[Prior citations: ${cited}]` : '';
        history.push({ role: 'assistant', content: `${m.content}${suffix}` });
      }
    }

    // The Messages API rejects a transcript that opens on an assistant turn,
    // which slicing can easily produce.
    while (history.length > 0 && history[0].role === 'assistant') {
      history.shift();
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
