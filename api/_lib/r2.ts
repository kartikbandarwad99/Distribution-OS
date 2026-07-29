/* R2 as a publish queue, not a warehouse.
 *
 * The bucket is private. Nothing is ever world-readable, and there is no
 * r2.dev domain in play. Two presigned URLs carry the whole flow:
 *
 *   upload   browser → R2 directly, via a presigned PUT. The bytes never pass
 *            through a serverless function, which sidesteps request body
 *            limits entirely and costs nothing in egress.
 *
 *   publish  Meta fetches the object itself — its publishing API takes an
 *            `image_url`, not an upload — so we hand it a presigned GET that
 *            expires within the hour. Meta copies the bytes onto its own CDN
 *            within seconds of the call, so the URL is used exactly once, by
 *            one server, and is dead long before anyone could share it.
 *
 * R2 egress is free, which is what makes handing Meta a fetchable URL cost
 * nothing however large the reel is. */

import { AwsClient } from "aws4fetch";
import { env } from "./env.js";

/** Long enough to survive a slow fetch of a large reel, short enough to be a
 *  non-event if one leaks into a log. */
const PUBLISH_URL_TTL_SECONDS = 60 * 60;
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

function client(): { aws: AwsClient; origin: string; bucket: string } {
  const { accountId, accessKeyId, secretAccessKey, bucket } = env.r2;
  return {
    aws: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
    }),
    origin: `https://${accountId}.r2.cloudflarestorage.com`,
    bucket,
  };
}

async function presign(
  key: string,
  method: "GET" | "PUT",
  ttlSeconds: number,
): Promise<string> {
  const { aws, origin, bucket } = client();
  const url = new URL(`${origin}/${bucket}/${encodeURI(key)}`);
  url.searchParams.set("X-Amz-Expires", String(ttlSeconds));

  const signed = await aws.sign(new Request(url, { method }), {
    aws: { signQuery: true },
  });
  return signed.url;
}

/** A URL the browser can PUT the file straight to. */
export function presignUpload(key: string): Promise<string> {
  return presign(key, "PUT", UPLOAD_URL_TTL_SECONDS);
}

/** A URL Meta can fetch the file from, which expires shortly after. */
export function presignFetch(key: string): Promise<string> {
  return presign(key, "GET", PUBLISH_URL_TTL_SECONDS);
}

/* The delete half of "transient storage" — media is removed once it is safely
 * on the platform's own CDN, so R2 holds a publish window rather than an
 * archive. Deliberately not called anywhere yet: while this is a single-user
 * tool inside the 10 GB free tier, keeping the bytes costs nothing and makes
 * republishing trivial. It is here so the retention policy is a scheduling
 * decision later, not a rewrite. */
export async function deleteObject(key: string): Promise<void> {
  const { aws, origin, bucket } = client();
  const response = await aws.fetch(`${origin}/${bucket}/${encodeURI(key)}`, {
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `Could not delete ${key} from R2: ${response.status} ${await response.text()}`,
    );
  }
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
