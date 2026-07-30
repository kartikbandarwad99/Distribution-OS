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

/** `<payload>.<expiryEpochSeconds>.<signature>`. Self-describing, so nothing
 *  needs to be stored server-side to validate it. */
export function mintToken(
  secret: string,
  payload: string,
  ttlSeconds: number,
): string {
  const expiry = Math.floor(Date.now() / 1000) + ttlSeconds;
  const body = `${encodeURIComponent(payload)}.${expiry}`;
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

  return decodeURIComponent(payload);
}
