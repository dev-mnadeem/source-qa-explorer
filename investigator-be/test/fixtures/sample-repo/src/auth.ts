import { createHmac, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 3600;

export type Session = { userId: string; issuedAt: number };

/**
 * Signs a session token. The signature covers the payload so a client cannot
 * edit the userId without invalidating it.
 */
export function issueToken(userId: string, secret: string): string {
  const payload = JSON.stringify({ userId, issuedAt: Date.now() });
  const body = Buffer.from(payload).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function verifyToken(token: string, secret: string): Session | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const session = JSON.parse(
    Buffer.from(body, "base64url").toString("utf8"),
  ) as Session;
  if (Date.now() - session.issuedAt > TOKEN_TTL_SECONDS * 1000) return null;
  return session;
}
