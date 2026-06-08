"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import { MessageBubble } from "@/components/chat/MessageBubble";

type Props = {
  messages: Message[];
  githubUrl: string;
  isPending: boolean;
  /** Live investigation trace, shown while a question is being answered. */
  trace?: React.ReactNode;
};

export function MessageList({
  messages,
  githubUrl,
  isPending,
  trace,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isPending]);

  if (messages.length === 0 && !isPending) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted text-sm">
        Ask a question to begin investigating this repo.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
      {messages.map((message) => (
        <MessageBubble
          key={message.id}
          message={message}
          githubUrl={githubUrl}
        />
      ))}
      {isPending &&
        (trace ?? (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-border bg-surface-2 px-4 py-3 text-sm text-muted">
              investigating…
            </div>
          </div>
        ))}
      <div ref={bottomRef} />
    </div>
  );
}
