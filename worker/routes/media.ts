/* Media in and media out.
 *
 * `upload-url` hands the browser a signed URL it can PUT a file straight to;
 * `upload` receives that PUT and streams the body into R2 without buffering it,
 * so a large reel costs no meaningful CPU against the free plan's 10 ms
 * ceiling. `fetch` is the other end: the short-lived URL Meta is given so it
 * can collect the bytes itself. See the note at the top of worker/lib/r2.ts for
 * why these are signed by us rather than presigned against S3 credentials. */

import type { Env } from "../lib/env.js";
import { json } from "../lib/http.js";
import { LIMITS } from "../lib/instagram.js";
import {
  mediaKey,
  readFetchToken,
  readUploadToken,
  signUploadUrl,
} from "../lib/r2.js";

interface UploadRequest {
  postId: string;
  filename: string;
  mime: string;
  bytes: number;
  position: number;
}

/** POST /api/media/upload-url — session required. */
export async function uploadUrl(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Partial<UploadRequest>;
  const { postId, filename, mime, bytes, position } = body;

  if (!postId || !filename || !mime) {
    return json({ error: "postId, filename and mime are required." }, 400);
  }

  // Rejected here rather than forty seconds into a publish, where Meta's only
  // signal is an opaque ERROR status.
  if (mime === "image/png") {
    return json(
      { error: "Instagram does not reliably accept PNG. Convert to JPEG first." },
      400,
    );
  }
  if (mime.startsWith("image/") && (bytes ?? 0) > LIMITS.imageBytes) {
    return json(
      {
        error: `Images must be under 8 MB; this one is ${((bytes ?? 0) / 1024 / 1024).toFixed(1)} MB.`,
      },
      400,
    );
  }

  const key = mediaKey(postId, position ?? 0, filename);

  await env.DB.prepare(
    `INSERT INTO media (id, post_id, r2_key, mime, bytes, position)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (r2_key) DO UPDATE SET
       mime = excluded.mime, bytes = excluded.bytes, evicted_at = NULL`,
  )
    .bind(
      crypto.randomUUID(),
      postId,
      key,
      mime,
      bytes ?? 0,
      position ?? 0,
    )
    .run();

  return json({ uploadUrl: signUploadUrl(env, key), key });
}

/** PUT /api/media/upload?t=… — the token is the authorisation, and it names
 *  exactly one key, so a valid token cannot be used to write anywhere else. */
export async function upload(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const key = token ? readUploadToken(env, token) : null;
  if (!key) return json({ error: "That upload link has expired." }, 403);
  if (!request.body) return json({ error: "No file in the request." }, 400);

  await env.MEDIA.put(key, request.body, {
    httpMetadata: {
      contentType: request.headers.get("content-type") ?? "application/octet-stream",
    },
  });
  return json({ ok: true, key });
}

/** GET /api/media/fetch?t=… — deliberately not behind the session gate: the
 *  caller is Meta's fetcher, which has no cookie. The signed, hour-long token
 *  is the whole of its authority. Range requests are honoured because video
 *  fetchers use them. */
export async function fetchMedia(request: Request, env: Env): Promise<Response> {
  const token = new URL(request.url).searchParams.get("t");
  const key = token ? readFetchToken(env, token) : null;
  if (!key) return json({ error: "That link has expired." }, 403);

  const range = request.headers.get("range");
  const object = await env.MEDIA.get(key, range ? { range: request.headers } : undefined);
  if (!object) return json({ error: "That file is no longer here." }, 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", "private, no-store");

  if (object.range && "offset" in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set(
      "content-range",
      `bytes ${offset}-${offset + length - 1}/${object.size}`,
    );
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
}
