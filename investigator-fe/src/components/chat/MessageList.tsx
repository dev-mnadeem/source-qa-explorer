"use client";

import { useEffect, useRef } from "react";
import type { Message } from "@/types/chat";
import { MessageBubble } from "@/components/chat/MessageBubble";
import { EXAMPLE_QUESTIONS } from "@/shared/questions";

type Props = {
  messages: Message[];
  githubUrl: string;
  isLoading: boolean;
  loadError: string | null;
  onRetry: () => void;
  onAsk: (question: string) => void;
  canAsk: boolean;
  /** Live investigation trace, shown while a question is being answered. */
  trace: React.ReactNode;
};

export function MessageList({
  messages,
  githubUrl,
  isLoading,
  loadError,
  onRetry,
  onAsk,
  canAsk,
  trace,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, trace]);

  let body: React.ReactNode;
  if (loadError) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center text-sm">
        <p className="text-foreground-2">
          The conversation could not be loaded: {loadError}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="text-accent underline underline-offset-4 hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  } else if (isLoading) {
    body = (
      <div aria-busy className="space-y-4" aria-label="Loading conversation">
        <div className="ml-auto h-10 w-2/3 animate-pulse rounded-xl bg-surface-2 sm:w-1/2" />
        <div className="h-28 w-5/6 animate-pulse rounded-xl bg-surface-2" />
      </div>
    );
  } else if (messages.length === 0 && !trace) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Ask about this repository</h2>
          <p className="text-sm text-muted">
            Answers cite the files and lines they rely on, then get audited.
          </p>
        </div>
        <ul className="flex flex-wrap justify-center gap-2">
          {EXAMPLE_QUESTIONS.map((question) => (
            <li key={question}>
              <button
                type="button"
                disabled={!canAsk}
                onClick={() => onAsk(question)}
                className="rounded-full border border-border bg-surface px-3 py-1.5 text-[13px] text-foreground-2 transition-colors hover:border-accent hover:text-foreground disabled:opacity-50"
              >
                {question}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  } else {
    body = (
      <>
        {messages.map((message) => (
          <MessageBubble
            key={message.id}
            message={message}
            githubUrl={githubUrl}
          />
        ))}
        {trace}
      </>
    );
  }

  return (
    <div
      role="log"
      aria-label="Conversation"
      className="flex-1 overflow-y-auto px-4 py-6 sm:px-6"
    >
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4">
        {body}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
