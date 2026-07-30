/* One HMAC, used for two things: the session cookie and the short-lived media
 * URLs handed to Meta. Both are "this string came from us and has not been
 * edited", which is exactly what an HMAC is for.
 *
 * `timingSafeEqual` rather than `===` because both comparisons are against
 * attacker-supplied input. */

import { createHmac, timingSafeEqual } from "node:crypto";

const sign = (secret: string, message: string): string =>
  createHmac("sha256", secret).update(message).digest("base64url");

export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the
  // length; compare a fixed-size digest of each instead.
  return timingSafeEqual(
    createHmac("sha256", "cmp").update(left).digest(),
    createHmac("sha256", "cmp").update(right).digest(),
  );
}

/** `<payload>.<expiryEpochSeconds>.<signature>`.
 *
 *  The payload is base64url, not percent-encoded. That is not cosmetic: media
 *  keys end in a filename, filenames contain a dot, and percent-encoding
 *  leaves it there — so `00-shot.jpg` produced a four-part token that failed
 *  its own three-part parse. base64url has no dot in its alphabet, so the
 *  separator can never appear inside a field. */
export function mintToken(
  secret: string,
  payload: string,
  ttlSeconds: number,
): string {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${Buffer.from(payload, "utf8").toString("base64url")}.${expiry}`;
  return `${body}.${sign(secret, body)}`;
}

/** Returns the payload, or null if the token is malformed, expired or forged. */
export function readToken(secret: string, token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [payload, expiry, signature] = parts;

  const body = `${payload}.${expiry}`;
  if (!safeEqual(signature, sign(secret, body))) return null;

  const expiresAt = Number(expiry);
  if (!Number.isFinite(expiresAt) || expiresAt * 1000 <= Date.now()) return null;

  return Buffer.from(payload, "base64url").toString("utf8");
}
