/* Token encryption.
 *
 * Access tokens are the whole ballgame — anyone holding one can post as you
 * for sixty days. They are encrypted before they reach the database so that a
 * dump is not a full account compromise, and they are never included in any
 * API response the browser can see.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to decrypt rather
 * than silently yielding garbage.
 *
 * Deliberately still `node:crypto`, which works under the `nodejs_compat`
 * compatibility flag. Rewriting to WebCrypto would buy nothing and would put
 * the one component holding sixty-day account tokens through an untested
 * change. The only edit in the port is that the key is passed in rather than
 * read from a module-scope environment. */

import { randomBytes, createCipheriv, createDecipheriv } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

const bytes = (b: Buffer): Uint8Array => new Uint8Array(b);

/** Returns `iv.ciphertext.tag`, each part base64url. */
export function encryptToken(plaintext: string, key: Uint8Array): string {
  const iv = bytes(randomBytes(IV_BYTES));
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    bytes(cipher.update(plaintext, "utf8")),
    bytes(cipher.final()),
  ]);
  const tag = cipher.getAuthTag();
  return [Buffer.from(iv), ciphertext, tag]
    .map((b) => b.toString("base64url"))
    .join(".");
}

export function decryptToken(encoded: string, key: Uint8Array): string {
  const parts = encoded.split(".");
  if (parts.length !== 3) {
    throw new Error("Stored token is malformed — reconnect the account.");
  }
  const [iv, ciphertext, tag] = parts.map((p) =>
    bytes(Buffer.from(p, "base64url")),
  );
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    bytes(decipher.update(ciphertext)),
    bytes(decipher.final()),
  ]).toString("utf8");
}
