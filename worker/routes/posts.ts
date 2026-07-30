/* Posts and their targets.
 *
 * The frontend keeps the whole workspace in localStorage. This route is the
 * narrow bridge: when a piece is about to be published or scheduled, the parts
 * publishing actually needs — the post, its media rows and one target per
 * account — are written through to D1. Everything else (projects, articles,
 * ordering, the plan board) stays local.
 *
 * That choice is deliberate and stated in the PR: it is the smaller half of
 * HANDOFF.md §7, and it leaves two sources of truth. The alternative — moving
 * the entire store to the API — is a much larger change that would block
 * publishing behind a rewrite of ~30 iterated React files.
 *
 * `PUT` semantics throughout: the frontend owns the ids, so re-syncing an
 * edited piece updates in place rather than accumulating duplicates. */

import type { Env } from "../lib/env.js";
import { json } from "../lib/http.js";
import { first, query, run, nowISO, type TargetState } from "../lib/db.js";

interface TargetInput {
  accountId: string;
  /** ISO-8601 UTC, or null for "not scheduled yet". */
  scheduledAt?: string | null;
}

interface PostInput {
  postId: string;
  kind: "image" | "carousel" | "reel" | "text";
  caption: string;
  projectId?: string | null;
  targets: TargetInput[];
}

/** The states a sync is not allowed to disturb. Re-syncing a piece whose
 *  target is mid-flight — or already on Instagram — must not reset it to
 *  draft and schedule it a second time. */
const SETTLED: TargetState[] = [
  "creating",
  "awaiting",
  "publishing",
  "published",
  "needs_review",
];

/** PUT /api/posts — upsert a post, its project link, and one target per
 *  account. Returns the target ids, which is what the caller needs in order to
 *  schedule or publish. */
export async function upsert(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Partial<PostInput>;
  const { postId, kind, caption, projectId, targets } = body;

  if (!postId || !kind) {
    return json({ error: "postId and kind are required." }, 400);
  }
  if (!Array.isArray(targets)) {
    return json({ error: "targets must be an array." }, 400);
  }

  const now = nowISO();

  // The project row is created on demand. The frontend invents project ids
  // locally and there is no separate "create project" call; without this the
  // foreign key would reject every post from a project the server has not
  // seen.
  if (projectId) {
    await run(
      env,
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      projectId,
      projectId,
      now,
    );
  }

  await run(
    env,
    `INSERT INTO posts (id, project_id, kind, caption, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       project_id = excluded.project_id,
       kind       = excluded.kind,
       caption    = excluded.caption,
       updated_at = excluded.updated_at`,
    postId,
    projectId ?? null,
    kind,
    caption ?? "",
    now,
    now,
  );

  const written: Array<{ id: string; accountId: string; state: TargetState }> =
    [];

  for (const target of targets) {
    if (!target?.accountId) continue;

    const existing = await first<{ id: string; state: TargetState }>(
      env,
      `SELECT id, state FROM post_targets WHERE post_id = ? AND account_id = ?`,
      postId,
      target.accountId,
    );

    if (existing && SETTLED.includes(existing.state)) {
      // In flight or already out. Left exactly as it is.
      written.push({
        id: existing.id,
        accountId: target.accountId,
        state: existing.state,
      });
      continue;
    }

    const id = existing?.id ?? crypto.randomUUID();
    await run(
      env,
      `INSERT INTO post_targets (id, post_id, account_id, scheduled_at, state)
       VALUES (?, ?, ?, ?, 'draft')
       ON CONFLICT (post_id, account_id) DO UPDATE SET
         scheduled_at = excluded.scheduled_at`,
      id,
      postId,
      target.accountId,
      target.scheduledAt ?? null,
    );
    written.push({ id, accountId: target.accountId, state: "draft" });
  }

  return json({ postId, targets: written });
}

/** GET /api/targets?postId=… — how publishing is going, for the UI. Never
 *  includes anything from `accounts` beyond the handle. */
export async function listTargets(
  request: Request,
  env: Env,
): Promise<Response> {
  const postId = new URL(request.url).searchParams.get("postId");

  const rows = postId
    ? await query(
        env,
        `SELECT t.id, t.post_id, t.account_id, t.scheduled_at, t.state,
                t.attempts, t.error_reason, t.published_at, t.platform_post_id,
                a.handle
           FROM post_targets t
           LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.post_id = ?
          ORDER BY t.scheduled_at ASC`,
        postId,
      )
    : await query(
        env,
        `SELECT t.id, t.post_id, t.account_id, t.scheduled_at, t.state,
                t.attempts, t.error_reason, t.published_at, t.platform_post_id,
                a.handle
           FROM post_targets t
           LEFT JOIN accounts a ON a.id = t.account_id
          WHERE t.state != 'draft'
          ORDER BY t.scheduled_at DESC
          LIMIT 200`,
      );

  return json({ targets: rows });
}
