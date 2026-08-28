"use client";

import { cn } from "@/lib/utils";
import type { Message } from "@/types/chat";
import { AuditBadge } from "@/components/chat/AuditBadge";
import { CitationLink } from "@/components/chat/CitationLink";
import { Markdown } from "@/components/chat/Markdown";
import { ToolCallTrace } from "@/components/chat/ToolCallTrace";

type Props = {
  message: Message;
  githubUrl: string;
};

export function MessageBubble({ message, githubUrl }: Props) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn( "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "bg-foreground text-background "
            : "bg-surface-2 text-foreground border border-border",
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}

        {!isUser && message.auditVerdict && (
          <div className="mt-3">
            <AuditBadge verdict={message.auditVerdict} />
          </div>
        )}

        {!isUser && message.citations.length > 0 && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[11px] uppercase tracking-wider text-muted">
              Citations
            </div>
            <div className="space-y-1.5">
              {message.citations.map((citation) => (
                <CitationLink
                  key={citation.id}
                  citation={citation}
                  githubUrl={githubUrl}
                />
              ))}
            </div>
          </div>
        )}

        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallTrace toolCalls={message.toolCalls} />
        )}
      </div>
    </div>
  );
}
