import { describe, expect, it } from "vitest";
import { githubBlobUrl } from "@/lib/github";

describe("githubBlobUrl", () => {
  it("links a line range at HEAD", () => {
    expect(
      githubBlobUrl("https://github.com/owner/repo", {
        filePath: "src/auth.ts",
        lineStart: 12,
        lineEnd: 30,
      }),
    ).toBe("https://github.com/owner/repo/blob/HEAD/src/auth.ts#L12-L30");
  });

  it("uses a single anchor for a one-line citation", () => {
    expect(
      githubBlobUrl("https://github.com/owner/repo/", {
        filePath: "index.ts",
        lineStart: 4,
        lineEnd: 4,
      }),
    ).toBe("https://github.com/owner/repo/blob/HEAD/index.ts#L4");
  });

  it("drops a leading ./ and escapes path segments", () => {
    expect(
      githubBlobUrl("https://github.com/owner/repo", {
        filePath: "./docs/My Notes#1.md",
        lineStart: 1,
        lineEnd: 2,
      }),
    ).toBe(
      "https://github.com/owner/repo/blob/HEAD/docs/My%20Notes%231.md#L1-L2",
    );
  });
});
