"use client";

import { FormEvent, KeyboardEvent, useId, useState } from "react";

type Props = {
  onSubmit: (content: string) => void;
  disabled: boolean;
};

const MAX_LENGTH = 4000;

export function Composer({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");
  const hintId = useId();

  const trySubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSubmit(trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    trySubmit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Cmd/Ctrl + Enter sends; plain Enter inserts a newline.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      trySubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border bg-surface px-4 py-3 sm:px-6"
    >
      <div className="mx-auto flex w-full max-w-3xl items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          maxLength={MAX_LENGTH}
          aria-label="Question about this repository"
          aria-describedby={hintId}
          placeholder="Ask about this codebase…"
          disabled={disabled}
          className="min-w-0 flex-1 resize-none rounded-md border border-border-strong bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-accent focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-md bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
      <p
        id={hintId}
        className="mx-auto mt-1.5 hidden w-full max-w-3xl text-[11px] text-muted sm:block"
      >
        ⌘/Ctrl + Enter to send
      </p>
    </form>
  );
}
