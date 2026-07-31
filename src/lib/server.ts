/* The hosted backend, from the browser.
 *
 * Only reachable on the web build. The desktop app has its own Rust side and
 * never calls any of this — every caller branches on `isTauri` first.
 *
 * Same origin as the SPA, so there is no CORS and no base URL to configure.
 * The session cookie is HttpOnly, so `credentials: "same-origin"` is what
 * carries authentication; nothing here ever holds a token.
 */

import { isTauri } from "./connect";

export class ServerError extends Error {
  constructor(
    message: string,
    /** HTTP status, so a caller can tell "signed out" from "broken". */
    readonly status: number,
    /** The Worker sets this on a missing environment variable. */
    readonly kind?: string,
  ) {
    super(message);
  }
}

async function call<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  if (isTauri) {
    throw new ServerError("The desktop app does not use the hosted API.", 0);
  }

  const { json, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    credentials: "same-origin",
    headers: json
      ? { "content-type": "application/json", ...rest.headers }
      : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    throw new ServerError(
      (payload.error as string) ?? `Request failed (${response.status}).`,
      response.status,
      payload.kind as string | undefined,
    );
  }
  return payload as T;
}

/* ── the password gate ─────────────────────────────────────────────────── */

export const session = () =>
  call<{ authenticated: boolean }>("/api/auth/session");

export const logIn = (password: string) =>
  call<{ ok: true }>("/api/auth/login", { method: "POST", json: { password } });

export const logOut = () =>
  call<{ ok: true }>("/api/auth/logout", { method: "POST" });

/* ── accounts ──────────────────────────────────────────────────────────── */

export interface ServerAccount {
  id: string;
  project_id: string | null;
  platform: string;
  external_id: string;
  handle: string | null;
  avatar_url: string | null;
  expires_at: string | null;
  scopes: string[];
  status: "active" | "expired" | "revoked";
  connected_at: string;
}

export const listAccounts = () =>
  call<{ accounts: ServerAccount[] }>("/api/accounts");

/** The scope that carries analytics. An account connected before analytics
 *  existed will not have it, and no amount of retrying fixes that — the token
 *  has to be reissued. Kept next to ServerAccount because that is the only
 *  place the check is ever made. */
export const INSIGHTS_SCOPE = "instagram_business_manage_insights";

export const canReadInsights = (account: ServerAccount): boolean =>
  account.scopes.includes(INSIGHTS_SCOPE);

/* ── metrics ───────────────────────────────────────────────────────────── */

/** One reading. Every number is nullable: Instagram does not report the same
 *  metrics for every media type, and absent must stay distinguishable from
 *  zero all the way to the chart. */
export interface ServerMetric {
  target_id: string;
  post_id: string;
  account_id: string;
  ig_media_id: string;
  fetched_at: string;
  reach: number | null;
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
}

export const listMetrics = (postId?: string) =>
  call<{ metrics: ServerMetric[] }>(
    postId ? `/api/metrics?postId=${encodeURIComponent(postId)}` : "/api/metrics",
  );

export interface RefreshResult {
  considered: number;
  updated: number;
  /** The batch filled up; there is more to fetch on the next call. */
  more: boolean;
  problems: Array<{ accountId: string; handle: string | null; reason: string }>;
}

export const refreshMetrics = (options: { accountId?: string; force?: boolean } = {}) =>
  call<RefreshResult>("/api/metrics/refresh", { method: "POST", json: options });

/* ── posts, media, publishing ──────────────────────────────────────────── */

export interface ServerTarget {
  id: string;
  post_id: string;
  account_id: string;
  scheduled_at: string | null;
  state:
    | "draft"
    | "queued"
    | "creating"
    | "awaiting"
    | "publishing"
    | "published"
    | "failed"
    | "needs_review";
  attempts: number;
  error_reason: string | null;
  published_at: string | null;
  platform_post_id: string | null;
  handle: string | null;
}

export const upsertPost = (input: {
  postId: string;
  kind: "image" | "carousel" | "reel" | "text";
  caption: string;
  projectId?: string | null;
  targets: Array<{ accountId: string; scheduledAt?: string | null }>;
}) =>
  call<{
    postId: string;
    targets: Array<{ id: string; accountId: string; state: string }>;
  }>("/api/posts", { method: "PUT", json: input });

export const listTargets = (postId?: string) =>
  call<{ targets: ServerTarget[] }>(
    postId ? `/api/targets?postId=${encodeURIComponent(postId)}` : "/api/targets",
  );

/** Two steps: ask for a signed URL, then PUT the bytes straight to it. The
 *  file never passes through this function's own request body. */
export async function uploadMedia(input: {
  postId: string;
  file: Blob;
  filename: string;
  position: number;
}): Promise<string> {
  const { uploadUrl, key } = await call<{ uploadUrl: string; key: string }>(
    "/api/media/upload-url",
    {
      method: "POST",
      json: {
        postId: input.postId,
        filename: input.filename,
        mime: input.file.type,
        bytes: input.file.size,
        position: input.position,
      },
    },
  );

  const put = await fetch(uploadUrl, {
    method: "PUT",
    body: input.file,
    headers: { "content-type": input.file.type },
  });
  if (!put.ok) {
    throw new ServerError(`Upload failed (${put.status}).`, put.status);
  }
  return key;
}

export const schedule = (targetId: string, scheduledAt: string) =>
  call<{ ok: true; scheduledAt: string }>("/api/schedule", {
    method: "POST",
    json: { targetId, scheduledAt },
  });

export const publishNow = (targetId: string) =>
  call<{ ok: true; state: string }>("/api/publish", {
    method: "POST",
    json: { targetId },
  });

export const cancel = (targetId: string) =>
  call<{ ok: true }>("/api/cancel", { method: "POST", json: { targetId } });
