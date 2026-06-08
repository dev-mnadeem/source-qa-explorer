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
    <article
      aria-label={isUser ? "Your question" : "Investigator answer"}
      className={cn("flex w-full", isUser ? "justify-end" : "justify-start")}
    >
      <div
        className={cn(
          "min-w-0 rounded-xl px-4 py-3 text-sm leading-relaxed",
          isUser
            ? "max-w-[90%] bg-foreground text-background sm:max-w-[75%]"
            : "w-full border border-border bg-surface-2 text-foreground",
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
            <h3 className="font-mono text-[11px] tracking-wider text-muted uppercase">
              Citations
            </h3>
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
    </article>
  );
}
