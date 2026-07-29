/* Token encryption.
 *
 * Access tokens are the whole ballgame — anyone holding one can post as you
 * for sixty days. They are encrypted before they reach Postgres so that a
 * database dump is not a full account compromise, and they are never included
 * in any API response the browser can see.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently yielding garbage. */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { env } from "./env.js";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

/** Returns `iv.ciphertext.tag`, each part base64url. */
const bytes = (b: Buffer): Uint8Array => new Uint8Array(b);

/** Returns `iv.ciphertext.tag`, each part base64url. */
export function encryptToken(plaintext: string): string {
  const iv = bytes(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, env.tokenEncKey, iv);
  const ciphertext = Buffer.concat([
    bytes(cipher.update(plaintext, "utf8")),
    bytes(cipher.final()),
  ]);
  const tag = cipher.getAuthTag();
  return [Buffer.from(iv), ciphertext, tag]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error("Stored token is malformed — reconnect the account.");
  }
  const [iv, ciphertext, tag] = parts.map((p) =>
    bytes(Buffer.from(p, "base64url")),
  );
  const decipher = createDecipheriv(ALGORITHM, env.tokenEncKey, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    bytes(decipher.update(ciphertext)),
    bytes(decipher.final()),
  ]).toString("utf8");
}
