"use client";

import { useMutation } from "@tanstack/react-query";
import { apiClientFetch } from "@/lib/api/client";
import { APIS } from "@/shared/routes";
import type { CreateSessionInput, Session } from "@/types/sessions";

export function useCreateSession() {
  return useMutation({
    mutationFn: (input: CreateSessionInput) =>
      apiClientFetch<Session>(APIS.sessions.create(), {
        method: "POST",
        body: JSON.stringify(input),
      }),
  });
}
