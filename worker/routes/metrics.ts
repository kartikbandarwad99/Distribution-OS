/* Metrics: reading the stored numbers, and going to get fresh ones.
 *
 * The read and the refresh are separate routes on purpose. Rendering the
 * analytics page must never depend on Instagram being reachable — a slow or
 * failing Graph API should show yesterday's numbers, not an empty chart and a
 * spinner. So `list` only ever touches D1, and `refresh` is the only thing
 * that talks to Meta. */

import type { Env } from "../lib/env.js";
import { config } from "../lib/env.js";
import { json } from "../lib/http.js";
import { decryptToken } from "../lib/crypto.js";
import { query, run, nowISO, isoFromNow } from "../lib/db.js";
import {
  fetchMediaMetrics,
  InsightsError,
  MediaGoneError,
} from "../lib/insights.js";
import { INSIGHTS_SCOPE } from "./instagram-auth.js";

/** How many media one refresh will fetch. Each costs two subrequests, and a
 *  Worker invocation gets fifty to external hosts — so this is a hard ceiling,
 *  not a tuning knob. The rest are picked up by the next run, oldest first. */
const BATCH = 20;

/** Numbers barely move minute to minute, and every fetch spends rate limit
 *  that publishing also needs. Anything fetched more recently than this is
 *  skipped rather than re-fetched. */
const STALE_AFTER_MS = 60 * 60 * 1000;

interface MetricRow {
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

/** GET /api/metrics[?postId=…] — the latest reading per target.
 *
 *  The correlated subquery picks one row per target out of the append-only
 *  history. It rides post_metrics_target_idx; without that index this is the
 *  query that would quietly read the whole table on every page load, and D1
 *  bills rows read. */
export async function list(request: Request, env: Env): Promise<Response> {
  const postId = new URL(request.url).searchParams.get("postId");

  const sql = `
    SELECT m.target_id, t.post_id, m.account_id, m.ig_media_id, m.fetched_at,
           m.reach, m.views, m.likes, m.comments, m.shares, m.saved
      FROM post_metrics m
      JOIN post_targets t ON t.id = m.target_id
     WHERE m.fetched_at = (
             SELECT MAX(fetched_at) FROM post_metrics
              WHERE target_id = m.target_id
           )
       ${postId ? "AND t.post_id = ?" : ""}
     ORDER BY m.fetched_at DESC
     LIMIT 500`;

  const rows = postId
    ? await query<MetricRow>(env, sql, postId)
    : await query<MetricRow>(env, sql);

  return json({ metrics: rows });
}

interface Due {
  target_id: string;
  account_id: string;
  ig_media_id: string;
  access_token_enc: string;
  scopes: string;
  handle: string | null;
}

/** POST /api/metrics/refresh — fetch fresh numbers for published targets.
 *
 *  Returns a per-account summary rather than throwing on the first failure. A
 *  revoked token on one account must not stop the other accounts refreshing,
 *  which is exactly the failure mode that matters once there is more than one
 *  account connected. */
export async function refresh(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    accountId?: string;
    /** Ignore the staleness window. The button in the UI sets this. */
    force?: boolean;
  };

  const cutoff = isoFromNow(-STALE_AFTER_MS);

  /* Published targets with a media id, least-recently-measured first, so a
   * backlog drains fairly instead of the same twenty being refreshed forever.
   * A target that has never been measured sorts first — COALESCE gives it an
   * empty string, which precedes every ISO timestamp lexically. */
  const due = await query<Due>(
    env,
    `SELECT t.id AS target_id, t.account_id, t.ig_media_id,
            a.access_token_enc, a.scopes, a.handle
       FROM post_targets t
       JOIN accounts a ON a.id = t.account_id
      WHERE t.state = 'published'
        AND t.ig_media_id IS NOT NULL
        AND t.removed_at IS NULL
        AND a.status = 'active'
        ${body.accountId ? "AND a.id = ?" : ""}
        ${body.force ? "" : "AND COALESCE((SELECT MAX(fetched_at) FROM post_metrics WHERE target_id = t.id), '') < ?"}
      ORDER BY COALESCE(
                 (SELECT MAX(fetched_at) FROM post_metrics WHERE target_id = t.id),
                 ''
               ) ASC
      LIMIT ${BATCH}`,
    ...([] as unknown[]).concat(
      body.accountId ? [body.accountId] : [],
      body.force ? [] : [cutoff],
    ),
  );

  const key = config(env).tokenEncKey;
  const now = nowISO();

  let updated = 0;
  /** Targets found to be deleted on Instagram during this run. */
  let removed = 0;
  const problems: Array<{ accountId: string; handle: string | null; reason: string }> = [];
  /* One account's token failing means every one of its targets will fail the
   * same way. Recording it here turns twenty identical failures into one
   * skipped account and nineteen untouched rows. */
  const dead = new Set<string>();

  for (const row of due) {
    if (dead.has(row.account_id)) continue;

    const scopes = JSON.parse(row.scopes || "[]") as string[];
    if (!scopes.includes(INSIGHTS_SCOPE)) {
      if (!dead.has(row.account_id)) {
        dead.add(row.account_id);
        problems.push({
          accountId: row.account_id,
          handle: row.handle,
          reason:
            "This account was connected before analytics was requested. Reconnect it to grant the insights permission.",
        });
      }
      continue;
    }

    try {
      const metrics = await fetchMediaMetrics(
        row.ig_media_id,
        decryptToken(row.access_token_enc, key),
      );

      await run(
        env,
        `INSERT INTO post_metrics
           (id, target_id, account_id, ig_media_id, fetched_at,
            reach, views, likes, comments, shares, saved, raw)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (target_id, fetched_at) DO NOTHING`,
        crypto.randomUUID(),
        row.target_id,
        row.account_id,
        row.ig_media_id,
        now,
        metrics.reach,
        metrics.views,
        metrics.likes,
        metrics.comments,
        metrics.shares,
        metrics.saved,
        JSON.stringify(metrics.raw),
      );
      updated++;
    } catch (error) {
      /* Deleted on Instagram. Recorded once and then excluded from the query
       * above, so this costs two subrequests exactly once instead of two on
       * every refresh for the rest of the account's life. Not a `problem`:
       * deleting your own post is a thing you meant to do, and listing it as
       * an error every time would train you to ignore the list. */
      if (error instanceof MediaGoneError) {
        await run(
          env,
          `UPDATE post_targets SET removed_at = ? WHERE id = ?`,
          now,
          row.target_id,
        );
        removed++;
        continue;
      }

      const reason =
        error instanceof InsightsError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Could not read insights.";

      /* An expired or revoked token is the account's problem, not this post's.
       * Marking it here is what makes Settings show "reconnect" instead of the
       * analytics page quietly staying empty forever. */
      if (/expired|revoked|session|OAuth|access token/i.test(reason)) {
        dead.add(row.account_id);
        await run(
          env,
          `UPDATE accounts SET status = 'expired' WHERE id = ?`,
          row.account_id,
        );
      }
      problems.push({
        accountId: row.account_id,
        handle: row.handle,
        reason,
      });
    }
  }

  return json({
    considered: due.length,
    updated,
    removed,
    /** True when the batch filled up, so the caller knows to come back. */
    more: due.length === BATCH,
    problems,
  });
}

/** The cron's share of the work, called from `scheduled`. Same body as the
 *  route, without the request. */
export async function refreshDue(env: Env): Promise<void> {
  await refresh(
    new Request("https://internal/api/metrics/refresh", {
      method: "POST",
      body: "{}",
      headers: { "content-type": "application/json" },
    }),
    env,
  );
}
