"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClientFetch } from "@/lib/api/client";
import { QueryKeys } from "@/shared/constants";
import { APIS } from "@/shared/routes";
import type { Session } from "@/types/sessions";

export function useSession(id: string) {
  return useQuery({
    queryKey: [QueryKeys.Session, id],
    queryFn: () => apiClientFetch<Session>(APIS.sessions.get(id)),
    enabled: Boolean(id),
  });
}
