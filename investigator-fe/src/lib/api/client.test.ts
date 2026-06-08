import { afterEach, describe, expect, it, vi } from "vitest";
import { apiClientFetch, apiUrl } from "@/lib/api/client";

function respond(status: number, body: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

describe("apiClientFetch", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns the parsed JSON body", async () => {
    respond(200, JSON.stringify({ id: "s1" }));
    await expect(apiClientFetch("/sessions/s1")).resolves.toEqual({ id: "s1" });
  });

  it("surfaces the API's message on an error response", async () => {
    respond(
      400,
      JSON.stringify({ message: "Expected a public GitHub URL", statusCode: 400 }),
    );
    await expect(apiClientFetch("/sessions")).rejects.toThrow(
      "Expected a public GitHub URL",
    );
  });

  it("joins a validation message list into one sentence", async () => {
    respond(
      400,
      JSON.stringify({ message: ["content must be a string", "too long"] }),
    );
    await expect(apiClientFetch("/sessions")).rejects.toThrow(
      "content must be a string; too long",
    );
  });

  it("falls back to the raw text when the body is not JSON", async () => {
    respond(502, "Bad gateway");
    await expect(apiClientFetch("/health")).rejects.toThrow("Bad gateway");
  });

  it("sends JSON bodies with a content type", async () => {
    respond(201, "{}");
    await apiClientFetch("/sessions", { method: "POST", body: "{}" });
    const [, init] = vi.mocked(fetch).mock.calls[0];
    expect(new Headers(init?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });
});

describe("apiUrl", () => {
  it("prefixes relative paths with the API base", () => {
    expect(apiUrl("/jobs/1/events")).toBe(
      "http://localhost:4000/api/jobs/1/events",
    );
  });
});
