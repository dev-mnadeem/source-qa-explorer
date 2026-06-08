const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

/**
 * Absolute URL for a path. EventSource cannot go through apiClientFetch, so it
 * needs the same base resolution exposed separately.
 */
export function apiUrl(path: string): string {
  return path.startsWith("http") ? path : `${API_BASE_URL}${path}`;
}

/** Nest returns `message` as a string, or as a list for validation errors. */
function errorMessage(text: string, fallback: string): string {
  try {
    const parsed = JSON.parse(text) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join("; ");
    if (parsed.message) return parsed.message;
  } catch {
    // Not JSON (a proxy error page, for instance); use the text as is.
  }
  return text || fallback;
}

export async function apiClientFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(apiUrl(path), { ...init, headers });

  if (!response.ok) {
    throw new Error(errorMessage(await response.text(), response.statusText));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}
