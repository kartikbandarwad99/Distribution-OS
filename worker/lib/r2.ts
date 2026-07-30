/* R2 as a publish queue, not a warehouse.
 *
 * The bucket is private. Nothing is ever world-readable and there is no r2.dev
 * domain in play. Two short-lived, HMAC-signed URLs on our own origin carry the
 * whole flow:
 *
 *   upload   browser PUTs to /api/media/upload?t=… and the Worker streams the
 *            body into the bucket. Streaming, so it costs no meaningful CPU
 *            against the 10 ms free-plan ceiling.
 *
 *   publish  Meta fetches the object itself — its publishing API takes an
 *            `image_url`, not an upload — so it is handed
 *            /api/media/fetch?t=… which expires within the hour. Meta copies
 *            the bytes onto its own CDN within seconds, so the URL is used
 *            once, by one server, and is dead long before anyone could share
 *            it.
 *
 * DEVIATION FROM HANDOFF.md, deliberate and worth reviewing: the Vercel version
 * presigned these URLs with aws4fetch and an S3 credential pair. HANDOFF.md §1
 * says to keep the presigned GET, but its infrastructure list says the `R2_*`
 * credential set is not needed because "every store is a binding" — the two
 * cannot both hold. Signing our own URL and serving the object through the
 * binding is what makes the second true: no S3 access key exists to leak, and
 * R2 egress is free either way. The cost is that Meta's fetch is a Worker
 * request rather than a direct R2 one, which is a few hundred requests a day
 * against a 100,000/day allowance. */

import type { Env } from "./env.js";
import { config } from "./env.js";
import { mintToken, readToken } from "./signing.js";

/** Long enough to survive a slow fetch of a large reel, short enough to be a
 *  non-event if one leaks into a log. */
const FETCH_URL_TTL_SECONDS = 60 * 60;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/** Namespaced so an upload token can never be replayed as a fetch token. */
const uploadPayload = (key: string) => `put:${key}`;
const fetchPayload = (key: string) => `get:${key}`;

export const signUploadUrl = (env: Env, key: string): string =>
  `${config(env).appUrl}/api/media/upload?t=${encodeURIComponent(
    mintToken(config(env).appPassword, uploadPayload(key), UPLOAD_URL_TTL_SECONDS),
  )}`;

export const signFetchUrl = (env: Env, key: string): string =>
  `${config(env).appUrl}/api/media/fetch?t=${encodeURIComponent(
    mintToken(config(env).appPassword, fetchPayload(key), FETCH_URL_TTL_SECONDS),
  )}`;

/** Returns the R2 key the token authorises, or null. */
export function readUploadToken(env: Env, token: string): string | null {
  const payload = readToken(config(env).appPassword, token);
  return payload?.startsWith("put:") ? payload.slice(4) : null;
}

export function readFetchToken(env: Env, token: string): string | null {
  const payload = readToken(config(env).appPassword, token);
  return payload?.startsWith("get:") ? payload.slice(4) : null;
}

/* The delete half of "transient storage" — media is removed once it is safely
 * on Instagram's own CDN, so R2 holds a publish window rather than an archive.
 * Wired into the `done` transition of the scheduler; deleting an object that is
 * already gone is a no-op, which is what makes it safe on an alarm retry. */
export async function deleteObject(env: Env, key: string): Promise<void> {
  await env.MEDIA.delete(key);
}

/** Deterministic, collision-free, and readable when browsing the bucket. */
export function mediaKey(
  postId: string,
  index: number,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `posts/${postId}/${String(index).padStart(2, "0")}-${safe}`;
}
