/* Request/response helpers.
 *
 * The Vercel version wrote into a mutable `res`. A Worker returns a `Response`,
 * so these are constructors rather than side effects — but `fail` keeps the
 * behaviour that mattered: a missing environment variable is the overwhelmingly
 * likely failure during setup, so it is reported as a 503 naming the variable
 * rather than disappearing into a generic 500. */

import { ConfigError } from "./env.js";

export const json = (body: unknown, status = 200, headers?: HeadersInit) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...headers },
  });

export const redirect = (location: string, headers?: HeadersInit) =>
  new Response(null, { status: 302, headers: { location, ...headers } });

export function fail(error: unknown): Response {
  const message =
    error instanceof Error ? error.message : "Something went wrong.";

  if (error instanceof ConfigError) {
    return json({ error: message, kind: "config" }, 503);
  }
  // Logged for `wrangler tail`; the client only gets the message.
  console.error(error);
  return json({ error: message }, 500);
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export const setCookie = (name: string, value: string, maxAgeSeconds: number) =>
  `${name}=${encodeURIComponent(value)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAgeSeconds}`;

export const clearCookie = (name: string) =>
  `${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;

/** Several routes set two cookies at once; `Headers` needs `append`, not a
 *  second `set`, or the first one is silently dropped. */
export function withCookies(response: Response, cookies: string[]): Response {
  const headers = new Headers(response.headers);
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}
