"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import { MessageBubble } from "@/components/chat/MessageBubble";

type Props = {
  messages: Message[];
  githubUrl: string;
  isPending: boolean;
};

export function MessageList({ messages, githubUrl, isPending }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isPending]);

  if (messages.length === 0 && !isPending) {
    return (
      <div className="flex-1 flex items-center justify-center text-zinc-500 dark:text-zinc-400 text-sm">
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
      {isPending && (
        <div className="flex justify-start">
          <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-3 text-sm text-zinc-500 dark:text-zinc-400">
            <div className="flex items-center gap-2">
              <div className="size-1.5 bg-zinc-400 rounded-full animate-pulse" />
              <div
                className="size-1.5 bg-zinc-400 rounded-full animate-pulse"
                style={{ animationDelay: "150ms" }}
              />
              <div
                className="size-1.5 bg-zinc-400 rounded-full animate-pulse"
                style={{ animationDelay: "300ms" }}
              />
              <span className="ml-2">investigating…</span>
            </div>
          </div>
        </div>
      )}
      <div ref={bottomRef} />
    </div>
  );
}
