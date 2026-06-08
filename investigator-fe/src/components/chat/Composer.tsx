"use client";

import { FormEvent, KeyboardEvent, useState } from "react";

type Props = {
  onSubmit: (content: string) => void;
  disabled: boolean;
};

export function Composer({ onSubmit, disabled }: Props) {
  const [value, setValue] = useState("");

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
    // Cmd/Ctrl + Enter sends. Plain Enter inserts newline.
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      trySubmit();
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="border-t border-border bg-surface px-4 py-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          rows={2}
          placeholder="Ask about this codebase…  (⌘/Ctrl + Enter to send)"
          disabled={disabled}
          className="flex-1 resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="rounded-md bg-foreground px-5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </form>
  );
}
