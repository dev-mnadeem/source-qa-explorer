"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useCreateSession } from "@/hooks/sessions/useCreateSession";
import { ROUTES } from "@/shared/routes";

export function PasteUrlForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const createSession = useCreateSession();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      const session = await createSession.mutateAsync({ githubUrl: trimmed });
      router.push(ROUTES.session(session.id));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create session";
      toast.error(message);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-3">
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://github.com/owner/repo"
        required
        disabled={createSession.isPending}
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600 disabled:opacity-50"
      />
      <button
        type="submit"
        disabled={createSession.isPending || !url.trim()}
        className="w-full rounded-md bg-zinc-900 text-zinc-50 px-4 py-3 text-sm font-medium hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
      >
        {createSession.isPending ? "Cloning repo…" : "Start investigating"}
      </button>
      <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
        Public GitHub repos only. Cloning is shallow and ephemeral.
      </p>
    </form>
  );
}
