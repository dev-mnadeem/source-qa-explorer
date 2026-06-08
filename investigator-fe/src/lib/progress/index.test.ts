import { describe, expect, it } from "vitest";
import { describeEvent } from "@/lib/progress";

const at = "2026-01-01T00:00:00.000Z";

describe("describeEvent", () => {
  it("does not repeat the tool name the summary already starts with", () => {
    expect(
      describeEvent({
        type: "tool",
        at,
        name: "read_file",
        summary: "read_file(src/a.ts, 1-40)",
      }),
    ).toEqual({ lead: "read_file", text: "(src/a.ts, 1-40)", tone: "muted" });
  });

  it("keeps a summary that does not start with the tool name", () => {
    expect(
      describeEvent({ type: "tool", at, name: "grep", summary: "error" }).text,
    ).toBe(" error");
  });

  it("marks failures and completions", () => {
    expect(describeEvent({ type: "error", at, message: "boom" })).toEqual({
      text: "boom",
      tone: "error",
    });
    expect(
      describeEvent({ type: "done", at, messageId: "m", verdict: "trusted" })
        .tone,
    ).toBe("success");
  });

  it("labels the pipeline stages", () => {
    expect(describeEvent({ type: "auditing", at }).text).toBe(
      "Auditing the answer",
    );
  });
});
