"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiClientFetch, apiUrl } from "@/lib/api/client";
import { QueryKeys } from "@/shared/constants";
import { APIS } from "@/shared/routes";
import type { Job, ProgressEvent } from "@/types/jobs";
import type { Message } from "@/types/chat";

/**
 * Runs one investigation and reports its progress.
 *
 * The API enqueues the work and answers immediately, so the client follows a
 * server-sent event stream rather than holding a request open for minutes. The
 * practical payoff is that the UI can show the agent working — each file it
 * reads, each search it runs — instead of an opaque spinner.
 */
export function useInvestigation(sessionId: string) {
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<ProgressEvent[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const closeStream = useCallback(() => {
    sourceRef.current?.close();
    sourceRef.current = null;
  }, []);

  // Never leave a stream open behind a navigation.
  useEffect(() => closeStream, [closeStream]);

  const refreshMessages = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: [QueryKeys.Messages, sessionId],
    });
  }, [queryClient, sessionId]);

  const ask = useCallback(
    async (content: string) => {
      closeStream();
      setError(null);
      setEvents([]);
      setIsRunning(true);

      // Show the question immediately; the server's copy arrives on refetch.
      const optimisticId = `optimistic-${Date.now()}`;
      queryClient.setQueryData<Message[]>(
        [QueryKeys.Messages, sessionId],
        (prev) => [
          ...(prev ?? []),
          {
            id: optimisticId,
            role: "user",
            content,
            citations: [],
            auditVerdict: null,
            toolCalls: null,
            cost: null,
            createdAt: new Date().toISOString(),
          },
        ],
      );

      let job: Job;
      try {
        job = await apiClientFetch<Job>(APIS.sessions.messages(sessionId), {
          method: "POST",
          body: JSON.stringify({ content }),
        });
      } catch (err) {
        // Roll the optimistic message back so the transcript stays truthful.
        queryClient.setQueryData<Message[]>(
          [QueryKeys.Messages, sessionId],
          (prev) => prev?.filter((m) => m.id !== optimisticId) ?? [],
        );
        setIsRunning(false);
        const message =
          err instanceof Error ? err.message : "Failed to queue the question";
        setError(message);
        throw err;
      }

      const source = new EventSource(apiUrl(APIS.jobs.events(job.id)));
      sourceRef.current = source;

      source.onmessage = (raw) => {
        const event = JSON.parse(raw.data as string) as ProgressEvent;
        setEvents((prev) => [...prev, event]);

        if (event.type === "done") {
          closeStream();
          setIsRunning(false);
          refreshMessages();
        } else if (event.type === "error") {
          closeStream();
          setIsRunning(false);
          setError(event.message);
          refreshMessages();
        }
      };

      source.onerror = () => {
        // EventSource retries on its own; only give up once the browser has
        // closed the connection for good.
        if (source.readyState === EventSource.CLOSED) {
          closeStream();
          setIsRunning(false);
          setError("Lost connection to the investigation stream.");
          refreshMessages();
        }
      };

      return job;
    },
    [closeStream, queryClient, refreshMessages, sessionId],
  );

  return { ask, events, isRunning, error };
}
