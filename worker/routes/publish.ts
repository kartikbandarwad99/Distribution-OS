/* Scheduling and publishing, ported from api/publish.ts.
 *
 * The old handler did the publishing itself, under a conditional-UPDATE lock
 * that stopped two concurrent cron ticks claiming the same target. Neither the
 * publishing nor the lock lives here now. The Durable Object for the account is
 * single-threaded and owns the queue, so these routes only put work into it —
 * which is why "Publish now" and a timer genuinely run the same code rather
 * than merely resembling each other. */

import type { Env } from "../lib/env.js";
import { json } from "../lib/http.js";
import { first, run, nowISO, type TargetState } from "../lib/db.js";

/** One instance per account: a Durable Object is single-threaded, so this is
 *  what makes concurrent publishes to one Instagram account impossible, and it
 *  is the only scope from which the per-account rate limit is visible. */
export const schedulerFor = (env: Env, accountId: string) =>
  env.ACCOUNT_SCHEDULER.get(env.ACCOUNT_SCHEDULER.idFromName(accountId));

async function targetAccount(
  env: Env,
  targetId: string,
): Promise<{ account_id: string; state: TargetState } | null> {
  return first<{ account_id: string; state: TargetState }>(
    env,
    `SELECT account_id, state FROM post_targets WHERE id = ?`,
    targetId,
  );
}

/** POST /api/publish — { targetId }. Publishes as soon as the object wakes,
 *  which is immediately. */
export async function publishNow(request: Request, env: Env): Promise<Response> {
  const { targetId } = (await request.json().catch(() => ({}))) as {
    targetId?: string;
  };
  if (!targetId) return json({ error: "targetId is required." }, 400);

  const target = await targetAccount(env, targetId);
  if (!target) return json({ error: "No such target." }, 404);
  if (target.state === "published") {
    return json({ error: "That target has already been published." }, 409);
  }

  await run(
    env,
    `UPDATE post_targets
        SET state = 'queued', scheduled_at = ?, error_reason = NULL, attempts = 0
      WHERE id = ?`,
    nowISO(),
    targetId,
  );

  await schedulerFor(env, target.account_id).publishNow(
    target.account_id,
    targetId,
  );
  return json({ ok: true, state: "queued" });
}

/** POST /api/schedule — { targetId, scheduledAt }. ISO-8601 UTC. */
export async function schedule(request: Request, env: Env): Promise<Response> {
  const { targetId, scheduledAt } = (await request.json().catch(() => ({}))) as {
    targetId?: string;
    scheduledAt?: string;
  };
  if (!targetId || !scheduledAt) {
    return json({ error: "targetId and scheduledAt are required." }, 400);
  }
  const at = Date.parse(scheduledAt);
  if (!Number.isFinite(at)) {
    return json({ error: "scheduledAt must be an ISO-8601 timestamp." }, 400);
  }

  /* A time already past would publish instantly, because `rearm` clamps the
   * alarm to `Math.max(at, Date.now())`. That clamp is right for a target that
   * fell a little behind — a deploy, a retry — and catastrophic for one that
   * was scheduled for the wrong half of the day: an AM/PM slip turns "goes out
   * tonight" into "goes out this second", with no way to take it back.
   *
   * So `schedule` refuses, and `publishNow` remains the only way to say "now".
   * The grace window covers clock skew between the browser and this Worker,
   * which is what a genuine "in one minute" schedule looks like from here. */
  const GRACE_MS = 60_000;
  if (at < Date.now() - GRACE_MS) {
    return json(
      {
        error:
          "That time has already passed. Pick a time in the future, or use Publish now.",
        scheduledAt: new Date(at).toISOString(),
        now: nowISO(),
      },
      400,
    );
  }

  const target = await targetAccount(env, targetId);
  if (!target) return json({ error: "No such target." }, 404);
  if (target.state === "published") {
    return json({ error: "That target has already been published." }, 409);
  }

  const iso = new Date(at).toISOString();
  await run(
    env,
    `UPDATE post_targets
        SET state = 'queued', scheduled_at = ?, error_reason = NULL, attempts = 0
      WHERE id = ?`,
    iso,
    targetId,
  );

  // Scheduling a post three weeks out costs exactly one row write and no
  // running process: setAlarm stores a timestamp and the object is evicted.
  await schedulerFor(env, target.account_id).enqueue(
    target.account_id,
    targetId,
    iso,
  );
  return json({ ok: true, scheduledAt: iso });
}

/** POST /api/cancel — { targetId }. */
export async function cancel(request: Request, env: Env): Promise<Response> {
  const { targetId } = (await request.json().catch(() => ({}))) as {
    targetId?: string;
  };
  if (!targetId) return json({ error: "targetId is required." }, 400);

  const target = await targetAccount(env, targetId);
  if (!target) return json({ error: "No such target." }, 404);

  await schedulerFor(env, target.account_id).cancel(targetId);
  await run(
    env,
    `UPDATE post_targets SET state = 'draft', scheduled_at = NULL WHERE id = ?`,
    targetId,
  );
  return json({ ok: true });
}
