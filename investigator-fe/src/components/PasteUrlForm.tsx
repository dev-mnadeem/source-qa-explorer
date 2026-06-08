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
      <div className="flex flex-col gap-2 rounded-lg border border-border-strong bg-surface p-2 shadow-sm sm:flex-row sm:items-center">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://github.com/owner/repo"
          aria-label="Public GitHub repository URL"
          required
          disabled={createSession.isPending}
          className="min-w-0 flex-1 bg-transparent px-4 py-2.5 font-mono text-sm text-foreground placeholder:text-muted focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={createSession.isPending || !url.trim()}
          className="shrink-0 rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {createSession.isPending ? "Cloning repo…" : "Investigate"}
        </button>
      </div>
      <p className="text-center text-xs text-muted">
        Public repositories only. The checkout is temporary and evicted
        automatically.
      </p>
    </form>
  );
}
