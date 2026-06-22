"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClientFetch } from "@/lib/api/client";
import { QueryKeys } from "@/shared/constants";
import { APIS } from "@/shared/routes";
import type { Message, SendMessageInput } from "@/types/chat";

export function useSendMessage(sessionId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SendMessageInput) =>
      apiClientFetch<Message>(APIS.sessions.messages(sessionId), {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onMutate: async (input): Promise<{ optimisticId: string }> => {
      await queryClient.cancelQueries({
        queryKey: [QueryKeys.Messages, sessionId],
      });
      const optimisticId = `optimistic-${Date.now()}`;
      queryClient.setQueryData<Message[]>(
        [QueryKeys.Messages, sessionId],
        (prev) => [
          ...(prev ?? []),
          {
            id: optimisticId,
            role: "user",
            content: input.content,
            citations: [],
            auditVerdict: null,
            toolCalls: null,
            createdAt: new Date().toISOString(),
          },
        ],
      );
      return { optimisticId };
    },
    onSuccess: () => {
      // Refetch from server: drops the optimistic user msg and pulls
      // the persisted user msg + assistant reply atomically.
      void queryClient.invalidateQueries({
        queryKey: [QueryKeys.Messages, sessionId],
      });
    },
    onError: (_err, _input, ctx) => {
      // Roll the optimistic message back.
      if (!ctx) return;
      queryClient.setQueryData<Message[]>(
        [QueryKeys.Messages, sessionId],
        (prev) => prev?.filter((m) => m.id !== ctx.optimisticId) ?? [],
      );
    },
  });
}
