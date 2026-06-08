import type { Citation } from "@/types/chat";

/** Link to the cited lines on GitHub, at the default branch's HEAD. */
export function githubBlobUrl(
  githubUrl: string,
  citation: Pick<Citation, "filePath" | "lineStart" | "lineEnd">,
): string {
  const base = githubUrl.replace(/\/+$/, "");
  const path = citation.filePath
    .replace(/^\.\//, "")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  const lines =
    citation.lineStart === citation.lineEnd
      ? `L${citation.lineStart}`
      : `L${citation.lineStart}-L${citation.lineEnd}`;
  return `${base}/blob/HEAD/${path}#${lines}`;
}
