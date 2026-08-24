"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useMessages } from "@/hooks/chat/useMessages";
import { useInvestigation } from "@/hooks/chat/useInvestigation";
import { useSession } from "@/hooks/sessions/useSession";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { ProgressTrace } from "@/components/chat/ProgressTrace";
import { ROUTES } from "@/shared/routes";

type Props = {
  sessionId: string;
};

export function Chat({ sessionId }: Props) {
  const sessionQuery = useSession(sessionId);
  const messagesQuery = useMessages(sessionId);
  const investigation = useInvestigation(sessionId);

  if (sessionQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-foreground-2">
          {sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "Session not found."}
        </p>
        <Link
          href={ROUTES.home()}
          className="text-sm text-muted hover:text-foreground underline"
        >
          Start a new investigation
        </Link>
      </div>
    );
  }

  const session = sessionQuery.data;
  const messages = messagesQuery.data ?? [];

  const handleSend = (content: string) => {
    void investigation.ask(content).catch((err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      toast.error(message);
    });
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={ROUTES.home()}
              className="text-xs text-muted hover:text-foreground"
            >
              ← New investigation
            </Link>
            {session && (
              <div className="mt-0.5 truncate text-sm font-medium">
                <span className="text-muted">
                  Investigating{" "}
                </span>
                <a
                  href={session.githubUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono hover:underline"
                >
                  {session.repoOwner}/{session.repoName}
                </a>
              </div>
            )}
          </div>
        </div>
      </header>
      <MessageList
        messages={messages}
        githubUrl={session?.githubUrl ?? ""}
        isPending={investigation.isRunning}
        trace={
          investigation.isRunning ? (
            <ProgressTrace events={investigation.events} />
          ) : null
        }
      />
      <Composer onSubmit={handleSend} disabled={investigation.isRunning} />
    </div>
  );
}
