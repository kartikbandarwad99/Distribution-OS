/* Postgres over HTTP (Neon), which is what makes this work on a serverless
 * runtime — no connection pool to exhaust, no socket to keep warm. */

import { neon } from "@neondatabase/serverless";
import { env } from "./env.js";

let cached: ReturnType<typeof neon> | null = null;

export function sql() {
  if (!cached) cached = neon(env.databaseUrl);
  return cached;
}

export type Platform = "instagram" | "threads" | "x" | "linkedin";

export interface Account {
  id: string;
  project_id: string | null;
  platform: Platform;
  /** Instagram's user ID — the `{ig-user-id}` every publishing call needs. */
  external_id: string;
  handle: string | null;
  access_token_enc: string;
  expires_at: string | null;
  scopes: string[];
  status: "active" | "expired" | "revoked";
}

export interface PostTarget {
  id: string;
  post_id: string;
  account_id: string;
  scheduled_at: string | null;
  state: "draft" | "queued" | "publishing" | "published" | "failed";
  attempts: number;
  platform_post_id: string | null;
  error: string | null;
}

export interface MediaRow {
  id: string;
  post_id: string;
  r2_key: string;
  mime: string;
  bytes: number;
  position: number;
}
