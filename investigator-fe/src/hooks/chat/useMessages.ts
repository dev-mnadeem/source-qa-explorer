"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClientFetch } from "@/lib/api/client";
import { QueryKeys } from "@/shared/constants";
import { APIS } from "@/shared/routes";
import type { Message } from "@/types/chat";

export function useMessages(sessionId: string) {
  return useQuery({
    queryKey: [QueryKeys.Messages, sessionId],
    queryFn: () =>
      apiClientFetch<Message[]>(APIS.sessions.messages(sessionId)),
    enabled: Boolean(sessionId),
  });
}
