/* D1, reached through a binding.
 *
 * Replaces the Neon-over-HTTP client. There is no connection string and no
 * network hop: `env.DB` is in-process, and its calls count against the
 * generous 1,000-subrequests-to-Cloudflare-services budget rather than the 50
 * external subrequests a Worker invocation gets.
 *
 * Every timestamp in this database is an ISO-8601 UTC string. SQLite has no
 * date type; ISO-8601 UTC sorts lexically in the same order it sorts
 * chronologically, which is what makes `scheduled_at <= ?` correct. Never
 * store a local time. */

import type { Env } from "./env.js";

export const nowISO = () => new Date().toISOString();

/** ISO-8601 UTC, `offsetMs` from now. Negative offsets look backwards. */
export const isoFromNow = (offsetMs: number) =>
  new Date(Date.now() + offsetMs).toISOString();

export type Platform = "instagram" | "threads" | "x" | "linkedin";

export type TargetState =
  | "draft"
  | "queued"
  | "creating"
  | "awaiting"
  | "publishing"
  | "published"
  | "failed"
  | "needs_review";

/** The states the sweep considers in-flight — a target in one of these is
 *  expected to be moved along by an alarm, so one that has been sitting here
 *  past its time means an alarm was lost. Kept in one place because the
 *  partial index in db/schema.sql must list exactly these. */
export const IN_FLIGHT_STATES: TargetState[] = [
  "queued",
  "creating",
  "awaiting",
  "publishing",
];

export interface Account {
  id: string;
  project_id: string | null;
  platform: Platform;
  /** Instagram's user ID — the `{ig-user-id}` every publishing call needs. */
  external_id: string;
  handle: string | null;
  access_token_enc: string;
  expires_at: string | null;
  /** JSON array, stringified. SQLite has no array type. */
  scopes: string;
  status: "active" | "expired" | "revoked";
}

export interface PostRow {
  id: string;
  kind: "image" | "carousel" | "reel" | "text";
  caption: string;
}

export interface PostTarget {
  id: string;
  post_id: string;
  account_id: string;
  scheduled_at: string | null;
  state: TargetState;
  attempts: number;
  container_id: string | null;
  ig_media_id: string | null;
  publish_started_at: string | null;
  platform_post_id: string | null;
  error_reason: string | null;
  published_at: string | null;
}

export interface MediaRow {
  id: string;
  post_id: string;
  r2_key: string;
  mime: string;
  bytes: number;
  position: number;
}

export const db = (env: Env) => env.DB;

/** `all()` with the rows typed, which is the shape almost every caller wants. */
export async function query<T>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T[]> {
  const result = await env.DB.prepare(sql)
    .bind(...params)
    .all<T>();
  return result.results ?? [];
}

export async function first<T>(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<T | null> {
  return (
    (await env.DB.prepare(sql)
      .bind(...params)
      .first<T>()) ?? null
  );
}

export async function run(
  env: Env,
  sql: string,
  ...params: unknown[]
): Promise<D1Result> {
  return env.DB.prepare(sql)
    .bind(...params)
    .run();
}
