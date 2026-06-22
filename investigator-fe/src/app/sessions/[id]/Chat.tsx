"use client";

import Link from "next/link";
import { toast } from "sonner";
import { useMessages } from "@/hooks/chat/useMessages";
import { useSendMessage } from "@/hooks/chat/useSendMessage";
import { useSession } from "@/hooks/sessions/useSession";
import { Composer } from "@/components/chat/Composer";
import { MessageList } from "@/components/chat/MessageList";
import { ROUTES } from "@/shared/routes";

type Props = {
  sessionId: string;
};

export function Chat({ sessionId }: Props) {
  const sessionQuery = useSession(sessionId);
  const messagesQuery = useMessages(sessionId);
  const sendMessage = useSendMessage(sessionId);

  if (sessionQuery.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {sessionQuery.error instanceof Error
            ? sessionQuery.error.message
            : "Session not found."}
        </p>
        <Link
          href={ROUTES.home()}
          className="text-sm text-zinc-500 hover:text-zinc-700 underline"
        >
          Start a new investigation
        </Link>
      </div>
    );
  }

  const session = sessionQuery.data;
  const messages = messagesQuery.data ?? [];

  const handleSend = (content: string) => {
    sendMessage.mutate(
      { content },
      {
        onError: (err) => {
          const message =
            err instanceof Error ? err.message : "Failed to send message";
          toast.error(message);
        },
      },
    );
  };

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              href={ROUTES.home()}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              ← New investigation
            </Link>
            {session && (
              <div className="mt-0.5 truncate text-sm font-medium">
                <span className="text-zinc-500 dark:text-zinc-400">
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
        isPending={sendMessage.isPending}
      />
      <Composer onSubmit={handleSend} disabled={sendMessage.isPending} />
    </div>
  );
}
