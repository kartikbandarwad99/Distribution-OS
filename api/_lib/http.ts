import type { VercelRequest, VercelResponse } from "@vercel/node";
import { ConfigError } from "./env.js";

/** Turns a thrown error into a response that says something useful.
 *
 * A missing environment variable is the overwhelmingly likely failure during
 * setup, so it is reported as a 503 with the variable named rather than
 * disappearing into a generic 500. */
export function fail(res: VercelResponse, error: unknown) {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";

  if (error instanceof ConfigError) {
    res.status(503).json({ error: message, kind: "config" });
    return;
  }
  // Logged for the Vercel function log; the client only gets the message.
  console.error(error);
  res.status(500).json({ error: message });
}

export function readCookie(req: VercelRequest, name: string): string | null {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export const clearCookie = (name: string) =>
  `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
