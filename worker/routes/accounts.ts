/* GET /api/accounts — safe fields only.
 *
 * `access_token_enc` is enumerated out rather than deleted from a `SELECT *`,
 * so a column added later cannot leak by default. Nothing in this response
 * would let a reader post as the user. */

import type { Env } from "../lib/env.js";
import { json } from "../lib/http.js";
import { first, query } from "../lib/db.js";

interface SafeAccount {
  id: string;
  project_id: string | null;
  platform: string;
  external_id: string;
  handle: string | null;
  avatar_url: string | null;
  expires_at: string | null;
  scopes: string;
  status: string;
  connected_at: string;
}

export async function list(_request: Request, env: Env): Promise<Response> {
  const rows = await query<SafeAccount>(
    env,
    `SELECT id, project_id, platform, external_id, handle, avatar_url,
            expires_at, scopes, status, connected_at
       FROM accounts
      ORDER BY connected_at DESC`,
  );

  return json({
    accounts: rows.map((row) => ({
      ...row,
      scopes: JSON.parse(row.scopes || "[]") as string[],
    })),
  });
}

/* DELETE /api/accounts?id=… — the connection, gone for good.
 *
 * The id travels in the query string because the router matches
 * `METHOD /path` exactly and has no path parameters. It is a server-minted
 * UUID, not anything about the person, so it is fine in a URL.
 *
 * This is a hard delete rather than `status = 'revoked'`, and that is the
 * whole point. A revoked row still comes back from `list`, and the client
 * mirrors every row it is given into a local channel — so a soft delete would
 * reproduce exactly the bug this route exists to fix: the channel returns on
 * the next load and the connection cannot be removed.
 *
 * The children are deleted explicitly, in one `batch` so it is all-or-nothing,
 * rather than left to `on delete cascade`. The cascade is declared in
 * db/schema.sql and would very likely do it — but it only fires while D1 has
 * foreign keys enforced, which is a database setting rather than anything this
 * code can see. Leaning on it would mean a disconnect that quietly orphans
 * every metric row if that setting ever changes. Three statements are cheaper
 * than that failure mode.
 *
 * Either way this destroys the published history for this account, which is a
 * real loss and not a detail — so the counts are gathered first and returned,
 * and the UI states them in the confirmation before anything is deleted.
 *
 * Two things this deliberately does not do:
 *
 *   * It does not tell Meta anything. Instagram Business Login has no token
 *     revocation endpoint — the only way to withdraw the app's access is the
 *     user doing it in Instagram's own settings. The response says so rather
 *     than letting the app imply an authority it does not have.
 *   * It does not stop an already-armed alarm. It does not need to: the
 *     Durable Object reloads from D1 when it wakes, finds the target gone and
 *     exits on "That target no longer exists." See worker/scheduler.ts. */
export async function remove(request: Request, env: Env): Promise<Response> {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return json({ error: "Which account? `id` is required." }, 400);

  const account = await first<{ handle: string | null }>(
    env,
    `SELECT handle FROM accounts WHERE id = ?`,
    id,
  );
  // Already gone is the outcome the caller wanted. Saying so beats a 404 that
  // makes a working Disconnect button look broken on a double click.
  if (!account) return json({ ok: true, alreadyGone: true });

  const counts = await first<{ targets: number; metrics: number }>(
    env,
    `SELECT
       (SELECT COUNT(*) FROM post_targets WHERE account_id = ?)  AS targets,
       (SELECT COUNT(*) FROM post_metrics WHERE account_id = ?)  AS metrics`,
    id,
    id,
  );

  // Children first, so no statement in here can leave a dangling reference
  // even for the instant the batch is open.
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM post_metrics WHERE account_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM post_targets WHERE account_id = ?`).bind(id),
    env.DB.prepare(`DELETE FROM accounts WHERE id = ?`).bind(id),
  ]);

  return json({
    ok: true,
    handle: account.handle,
    removedTargets: counts?.targets ?? 0,
    removedMetrics: counts?.metrics ?? 0,
  });
}
