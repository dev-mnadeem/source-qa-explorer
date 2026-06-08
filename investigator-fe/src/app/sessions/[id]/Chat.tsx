"use client";

import Link from "next/link";
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
      <main className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <h1 className="text-lg font-semibold">This session is unavailable</h1>
        <p className="max-w-md text-sm text-foreground-2">
          {sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "Session not found."}
        </p>
        <Link
          href={ROUTES.home()}
          className="text-sm text-accent underline underline-offset-4 hover:no-underline"
        >
          Start a new investigation
        </Link>
      </main>
    );
  }

  const session = sessionQuery.data;

  const handleSend = (content: string) => {
    // A failure is shown in the banner by useInvestigation.
    void investigation.ask(content).catch(() => undefined);
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden">
      <header className="border-b border-border bg-surface px-4 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-0.5">
          <Link
            href={ROUTES.home()}
            className="w-fit text-xs text-muted hover:text-foreground"
          >
            ← New investigation
          </Link>
          {session ? (
            <h1 className="truncate text-sm font-medium">
              <span className="text-muted">Investigating </span>
              <a
                href={session.githubUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono hover:underline"
              >
                {session.repoOwner}/{session.repoName}
              </a>
            </h1>
          ) : (
            <div
              aria-hidden
              className="mt-1 h-4 w-48 animate-pulse rounded bg-surface-2"
            />
          )}
        </div>
      </header>

      {investigation.error && (
        <div
          role="alert"
          className="border-b border-suspect/30 bg-suspect-soft px-4 py-2 sm:px-6"
        >
          <div className="mx-auto flex w-full max-w-3xl items-start justify-between gap-3 text-sm text-suspect">
            <p className="min-w-0 break-words">{investigation.error}</p>
            <button
              type="button"
              onClick={investigation.dismissError}
              className="shrink-0 text-xs underline underline-offset-2"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <MessageList
        messages={messagesQuery.data ?? []}
        githubUrl={session?.githubUrl ?? ""}
        isLoading={messagesQuery.isPending}
        loadError={messagesQuery.isError ? messagesQuery.error.message : null}
        onRetry={() => void messagesQuery.refetch()}
        onAsk={handleSend}
        canAsk={Boolean(session) && !investigation.isRunning}
        trace={
          investigation.isRunning ? (
            <ProgressTrace events={investigation.events} />
          ) : null
        }
      />
      <Composer
        onSubmit={handleSend}
        disabled={!session || investigation.isRunning}
      />
    </main>
  );
}
