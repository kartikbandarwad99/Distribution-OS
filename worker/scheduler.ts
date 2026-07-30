/* AccountScheduler — one Durable Object per connected account.
 *
 * This is the heart of the app, and the only part that is new rather than
 * ported. It holds a durable timer and serialises publishing for one account.
 *
 * WHAT IT IS NOT: a second database. D1 remains the app's database — what the
 * UI reads and writes. This object owns only in-flight publishing state, and
 * mirrors each transition back to D1 so the UI can show progress.
 *
 * Three properties are load-bearing, and breaking any of them breaks the
 * design rather than merely degrading it:
 *
 * 1. ONE STEP PER WAKE. Durable Objects bill compute duration as wall-clock
 *    time while active, unlike Workers, which bill CPU only. A handler that
 *    awaits Meta in a `while` loop for three minutes is billed for three
 *    minutes. Each alarm advances exactly one target exactly one step, re-arms,
 *    and exits — typically 2–4 Meta calls and a couple of hundred milliseconds.
 *    Never sleep in here. Never loop over the queue.
 *
 * 2. THE ALARM IS AT-LEAST-ONCE. Cloudflare's docs are explicit that alarms
 *    have guaranteed at-least-once execution, are retried on failure with
 *    exponential backoff, and "in rare cases, alarms may fire more than once".
 *    Single-threading prevents two concurrent publishes; it does nothing about
 *    a retry after a partial success. See `stepPublishing` for the guard, which
 *    is the single most dangerous piece of code in this repository.
 *
 * 3. "PUBLISH NOW" AND THE ALARM RUN THE SAME CODE. `publishNow` seeds the
 *    queue and drives the identical step functions. There is no second,
 *    hand-tested path that differs from the one that runs on a timer. */

import { DurableObject } from "cloudflare:workers";
import type { Env } from "./lib/env.js";
import { config } from "./lib/env.js";
import { decryptToken } from "./lib/crypto.js";
import { signFetchUrl, deleteObject } from "./lib/r2.js";
import {
  containerStatus,
  createCarouselChild,
  createCarouselParent,
  createContainer,
  publishContainer,
  validate,
  InstagramError,
  LIMITS,
} from "./lib/instagram.js";
import type { Account, MediaRow, PostRow, TargetState } from "./lib/db.js";

/** After this many failures on the same step, the target is parked and the
 *  queue moves on. A stuck post must not block the account forever. */
const MAX_ATTEMPTS = 5;

/** How long to wait before re-checking a container Meta is still processing.
 *  A reel routinely needs thirty seconds or more. */
const POLL_INTERVAL_MS = 30_000;

/** Meta's containers are created, then polled; going straight from creating to
 *  a status check with no gap just wastes a wake. */
const FIRST_POLL_DELAY_MS = 5_000;

type QueueState =
  | "queued"
  | "creating"
  | "awaiting"
  | "publishing"
  | "done"
  | "error";

interface QueueRow extends Record<string, SqlStorageValue> {
  target_id: string;
  scheduled_at: string;
  state: QueueState;
  container_id: string | null;
  /** JSON array of carousel child container ids, before the parent exists. */
  child_ids: string | null;
  attempts: number;
  publish_started_at: string | null;
  ig_media_id: string | null;
}

/** Everything a step needs, read from D1 once per wake. */
interface Context {
  account: Account;
  post: PostRow;
  media: MediaRow[];
  accessToken: string;
}

export class AccountScheduler extends DurableObject<Env> {
  private sql: SqlStorage;
  /** Serialises steps against each other. The DO is single-threaded, but
   *  `await fetch()` opens the input gate, so a `publishNow` call can interleave
   *  with an alarm that is mid-flight. Chaining through one promise makes
   *  "one step at a time" true rather than nearly true. */
  private working: Promise<unknown> = Promise.resolve();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`
        CREATE TABLE IF NOT EXISTS queue (
          target_id          TEXT PRIMARY KEY,
          scheduled_at       TEXT NOT NULL,
          state              TEXT NOT NULL,
          container_id       TEXT,
          child_ids          TEXT,
          attempts           INTEGER NOT NULL DEFAULT 0,
          publish_started_at TEXT,
          ig_media_id        TEXT
        )
      `);
      this.sql.exec(
        `CREATE INDEX IF NOT EXISTS queue_due_idx ON queue (scheduled_at)
           WHERE state != 'done'`,
      );
    });
  }

  /* ---- RPC ------------------------------------------------------------- */

  /** Add or re-schedule a target. Idempotent: enqueueing something already in
   *  flight only moves its scheduled time. */
  async enqueue(
    accountId: string,
    targetId: string,
    scheduledAtISO: string,
  ): Promise<void> {
    await this.ctx.storage.put("account_id", accountId);
    this.sql.exec(
      `INSERT INTO queue (target_id, scheduled_at, state)
            VALUES (?, ?, 'queued')
       ON CONFLICT (target_id) DO UPDATE SET scheduled_at = excluded.scheduled_at`,
      targetId,
      scheduledAtISO,
    );
    await this.rearm();
  }

  async cancel(targetId: string): Promise<void> {
    this.sql.exec(`DELETE FROM queue WHERE target_id = ?`, targetId);
    await this.rearm();
  }

  /** Rebuild the queue from D1 and re-arm. This is what the quarter-hourly
   *  sweep calls when it finds a target that should have moved by now — an
   *  object that was deleted, a deploy that dropped an alarm, a bug that exited
   *  without re-arming. It repairs; it does not publish. */
  async poke(accountId: string): Promise<void> {
    await this.ctx.storage.put("account_id", accountId);

    const stale = await this.env.DB.prepare(
      `SELECT id, scheduled_at, state FROM post_targets
        WHERE account_id = ?
          AND state IN ('queued','creating','awaiting','publishing')`,
    )
      .bind(accountId)
      .all<{ id: string; scheduled_at: string | null; state: TargetState }>();

    for (const row of stale.results ?? []) {
      const existing = this.sql
        .exec<QueueRow>(`SELECT * FROM queue WHERE target_id = ?`, row.id)
        .toArray()[0];
      if (!existing) {
        // D1 believes this is in flight and the object has no record of it —
        // the exact case the sweep exists for. Re-admit it at its own time.
        this.sql.exec(
          `INSERT INTO queue (target_id, scheduled_at, state) VALUES (?, ?, 'queued')`,
          row.id,
          row.scheduled_at ?? new Date().toISOString(),
        );
      }
    }
    await this.rearm();
  }

  /** The manual button. Same queue, same step functions, run now. */
  async publishNow(accountId: string, targetId: string): Promise<void> {
    await this.enqueue(accountId, targetId, new Date().toISOString());
    await this.drainOne();
  }

  /* ---- the alarm ------------------------------------------------------- */

  async alarm(): Promise<void> {
    await this.drainOne();
  }

  /** Advance the earliest due target exactly one step, then re-arm. */
  private drainOne(): Promise<void> {
    const run = this.working.then(async () => {
      const row = this.nextDue();
      if (row) await this.advance(row);
      await this.rearm();
    });
    // Kept off `this.working` as a rejected promise, or every later step would
    // inherit the failure.
    this.working = run.catch(() => undefined);
    return run;
  }

  private nextDue(): QueueRow | undefined {
    return this.sql
      .exec<QueueRow>(
        `SELECT * FROM queue
          WHERE state NOT IN ('done','error') AND scheduled_at <= ?
          ORDER BY scheduled_at ASC LIMIT 1`,
        new Date().toISOString(),
      )
      .toArray()[0];
  }

  /** Set the alarm for the next thing that needs attention. One alarm per
   *  object, so this is always "the earliest", never "one per target". */
  private async rearm(): Promise<void> {
    const next = this.sql
      .exec<{ scheduled_at: string }>(
        `SELECT scheduled_at FROM queue
          WHERE state NOT IN ('done','error')
          ORDER BY scheduled_at ASC LIMIT 1`,
      )
      .toArray()[0];

    if (!next) {
      await this.ctx.storage.deleteAlarm();
      return;
    }
    const at = Date.parse(next.scheduled_at);
    await this.ctx.storage.setAlarm(
      Number.isFinite(at) ? Math.max(at, Date.now()) : Date.now(),
    );
  }

  /** Move a target's next attention time. The only way a step says "later". */
  private reschedule(targetId: string, delayMs: number): void {
    this.sql.exec(
      `UPDATE queue SET scheduled_at = ? WHERE target_id = ?`,
      new Date(Date.now() + delayMs).toISOString(),
      targetId,
    );
  }

  private setState(targetId: string, state: QueueState): void {
    this.sql.exec(
      `UPDATE queue SET state = ? WHERE target_id = ?`,
      state,
      targetId,
    );
  }

  /* ---- the state machine ----------------------------------------------- */

  private async advance(row: QueueRow): Promise<void> {
    try {
      const context = await this.load(row.target_id);

      switch (row.state) {
        case "queued":
          await this.stepQueued(row, context);
          break;
        case "creating":
          await this.stepCreating(row, context);
          break;
        case "awaiting":
          await this.stepAwaiting(row, context);
          break;
        case "publishing":
          await this.stepPublishing(row, context);
          break;
      }
    } catch (error) {
      await this.recordFailure(row, error);
    }
  }

  /** queued → creating. Create every container this post needs. */
  private async stepQueued(row: QueueRow, context: Context): Promise<void> {
    const { account, post, media, accessToken } = context;

    if (post.kind === "text") {
      throw new InstagramError(
        "Instagram requires media — a text post cannot be published.",
      );
    }
    validate(post.kind, post.caption, media.length);

    // Checked before any container is created, so hitting the cap reads as a
    // limit rather than a failure partway through a carousel.
    const wait = await this.rateLimitDelay(account.id);
    if (wait !== null) {
      this.reschedule(row.target_id, wait);
      await this.mirror(row.target_id, {
        state: "queued",
        error_reason: `This account has published ${LIMITS.postsPer24h} posts in the last 24 hours. Waiting for the window to clear.`,
      });
      return;
    }

    // Signed at the last possible moment so the clock on the URL starts as
    // late as it can.
    const urls = media.map((item) => signFetchUrl(this.env, item.r2_key));

    if (post.kind === "carousel") {
      const children: string[] = [];
      for (const url of urls) {
        children.push(
          await createCarouselChild(account.external_id, accessToken, url),
        );
      }
      this.sql.exec(
        `UPDATE queue SET child_ids = ?, state = 'creating', attempts = 0 WHERE target_id = ?`,
        JSON.stringify(children),
        row.target_id,
      );
      await this.mirror(row.target_id, { state: "creating" });
    } else {
      const containerId = await createContainer(
        account.external_id,
        accessToken,
        { kind: post.kind, mediaUrl: urls[0], caption: post.caption },
      );
      this.sql.exec(
        `UPDATE queue SET container_id = ?, state = 'creating', attempts = 0 WHERE target_id = ?`,
        containerId,
        row.target_id,
      );
      await this.mirror(row.target_id, {
        state: "creating",
        container_id: containerId,
      });
    }

    this.reschedule(row.target_id, FIRST_POLL_DELAY_MS);
  }

  /** creating → awaiting. One status check per wake, no waiting.
   *
   *  For a carousel this is two sub-phases: the children must all finish
   *  before the parent can be created, and then the parent must finish too.
   *  `container_id` being set is what distinguishes them. */
  private async stepCreating(row: QueueRow, context: Context): Promise<void> {
    const { account, post, accessToken } = context;

    if (post.kind === "carousel" && !row.container_id) {
      const children = JSON.parse(row.child_ids ?? "[]") as string[];
      for (const child of children) {
        if ((await containerStatus(child, accessToken)) !== "FINISHED") {
          this.reschedule(row.target_id, POLL_INTERVAL_MS);
          return;
        }
      }
      const parentId = await createCarouselParent(
        account.external_id,
        accessToken,
        children,
        post.caption,
      );
      this.sql.exec(
        `UPDATE queue SET container_id = ?, attempts = 0 WHERE target_id = ?`,
        parentId,
        row.target_id,
      );
      await this.mirror(row.target_id, { container_id: parentId });
      this.reschedule(row.target_id, FIRST_POLL_DELAY_MS);
      return;
    }

    const status = await containerStatus(row.container_id!, accessToken);
    if (status !== "FINISHED") {
      this.reschedule(row.target_id, POLL_INTERVAL_MS);
      return;
    }

    this.sql.exec(
      `UPDATE queue SET state = 'awaiting', attempts = 0 WHERE target_id = ?`,
      row.target_id,
    );
    await this.mirror(row.target_id, { state: "awaiting" });
    this.reschedule(row.target_id, 0);
  }

  /** awaiting → publishing. A separate wake purely so the write-ahead marker
   *  below is committed by a wake that has not already spent its budget. */
  private async stepAwaiting(row: QueueRow, _context: Context): Promise<void> {
    this.setState(row.target_id, "publishing");
    await this.mirror(row.target_id, { state: "publishing" });
    this.reschedule(row.target_id, 0);
  }

  /** publishing → done. THE DANGEROUS ONE.
   *
   *  `media_publish` is the one call in this system that cannot be taken back.
   *  Creating a container twice is harmless — the extra one expires. Deleting
   *  an R2 object twice is harmless. Publishing twice puts a duplicate post on
   *  a real Instagram account, and there is no undo.
   *
   *  The guard is a write-ahead marker, not a write-behind one:
   *
   *    - `publish_started_at` is written BEFORE the call, never after.
   *    - Output gates hold outgoing `fetch()` requests until pending storage
   *      writes have committed, so the marker is durable by the time Meta hears
   *      from us. This is a documented runtime guarantee, not a hopeful
   *      ordering.
   *    - If a later attempt finds the marker set and no `ig_media_id`, a
   *      previous attempt may have succeeded and crashed before recording it.
   *      That attempt does NOT publish again. It parks the target in
   *      `needs_review`, which surfaces in the UI as "may have posted — check
   *      Instagram".
   *
   *  That is the trade, and it is deliberate: a post needing one manual glance
   *  is recoverable, a duplicate post is not. */
  private async stepPublishing(row: QueueRow, context: Context): Promise<void> {
    if (row.publish_started_at && !row.ig_media_id) {
      await this.markNeedsReview(row.target_id);
      return;
    }

    const { account, accessToken } = context;

    this.sql.exec(
      `UPDATE queue SET publish_started_at = ? WHERE target_id = ?`,
      new Date().toISOString(),
      row.target_id,
    );

    const mediaId = await publishContainer(
      account.external_id,
      row.container_id!,
      accessToken,
    );

    this.sql.exec(
      `UPDATE queue SET ig_media_id = ?, state = 'done' WHERE target_id = ?`,
      mediaId,
      row.target_id,
    );

    await this.env.DB.prepare(
      `UPDATE post_targets
          SET state = 'published', ig_media_id = ?, platform_post_id = ?,
              published_at = ?, error_reason = NULL
        WHERE id = ?`,
    )
      .bind(mediaId, mediaId, new Date().toISOString(), row.target_id)
      .run();

    // R2 is a publish queue, not a warehouse: the bytes are on Instagram's CDN
    // now. Deleting is idempotent, so a repeated wake is harmless.
    await this.cleanUpMedia(context);
  }

  private async cleanUpMedia(context: Context): Promise<void> {
    for (const item of context.media) {
      await deleteObject(this.env, item.r2_key);
      await this.env.DB.prepare(
        `UPDATE media SET evicted_at = ? WHERE r2_key = ?`,
      )
        .bind(new Date().toISOString(), item.r2_key)
        .run();
    }
  }

  /* ---- failure --------------------------------------------------------- */

  private async recordFailure(row: QueueRow, error: unknown): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = row.attempts + 1;

    if (attempts >= MAX_ATTEMPTS) {
      this.sql.exec(
        `UPDATE queue SET attempts = ?, state = 'error' WHERE target_id = ?`,
        attempts,
        row.target_id,
      );
      await this.mirror(row.target_id, {
        state: "failed",
        attempts,
        error_reason: message,
      });
      return;
    }

    this.sql.exec(
      `UPDATE queue SET attempts = ? WHERE target_id = ?`,
      attempts,
      row.target_id,
    );
    // Backing off on our own clock rather than by throwing: throwing would get
    // the alarm retried by the runtime, but it would also retry the whole wake
    // including anything already done in it.
    this.reschedule(row.target_id, POLL_INTERVAL_MS * attempts);
    await this.mirror(row.target_id, { attempts, error_reason: message });
  }

  private async markNeedsReview(targetId: string): Promise<void> {
    this.setState(targetId, "error");
    await this.mirror(targetId, {
      state: "needs_review",
      error_reason:
        "A publish attempt was interrupted after it had already been sent to Instagram. It may have posted — check the account before retrying.",
    });
  }

  /* ---- D1 -------------------------------------------------------------- */

  /** Reads everything a step needs. One indexed read per table. */
  private async load(targetId: string): Promise<Context> {
    const target = await this.env.DB.prepare(
      `SELECT post_id, account_id FROM post_targets WHERE id = ?`,
    )
      .bind(targetId)
      .first<{ post_id: string; account_id: string }>();

    if (!target) throw new Error("That target no longer exists.");

    const account = await this.env.DB.prepare(
      `SELECT * FROM accounts WHERE id = ?`,
    )
      .bind(target.account_id)
      .first<Account>();

    if (!account) throw new Error("That account no longer exists.");
    if (account.platform !== "instagram") {
      throw new Error(`No publisher for ${account.platform} yet.`);
    }
    if (account.expires_at && account.expires_at < new Date().toISOString()) {
      throw new Error(
        "This account's Instagram token has expired. Reconnect it in Settings.",
      );
    }

    const post = await this.env.DB.prepare(
      `SELECT id, kind, caption FROM posts WHERE id = ?`,
    )
      .bind(target.post_id)
      .first<PostRow>();

    if (!post) throw new Error("That post no longer exists.");

    const media = await this.env.DB.prepare(
      `SELECT * FROM media WHERE post_id = ? ORDER BY position ASC`,
    )
      .bind(target.post_id)
      .all<MediaRow>();

    return {
      account,
      post,
      media: media.results ?? [],
      accessToken: decryptToken(
        account.access_token_enc,
        config(this.env).tokenEncKey,
      ),
    };
  }

  /** Mirrors a transition into D1 so the UI can show progress. The DO's own
   *  table stays the source of truth for in-flight work. */
  private async mirror(
    targetId: string,
    fields: Partial<{
      state: TargetState;
      container_id: string;
      attempts: number;
      error_reason: string | null;
    }>,
  ): Promise<void> {
    const columns = Object.keys(fields);
    if (columns.length === 0) return;
    await this.env.DB.prepare(
      `UPDATE post_targets SET ${columns.map((c) => `${c} = ?`).join(", ")} WHERE id = ?`,
    )
      .bind(...columns.map((c) => (fields as Record<string, unknown>)[c]), targetId)
      .run();
  }

  /** Instagram allows 25 published posts per rolling 24 hours, per account.
   *  Counted from our own records, which costs no subrequest and works even
   *  when Meta's quota endpoint is unavailable.
   *
   *  Returns null when there is room, or how long to wait otherwise — timed to
   *  just past the moment the oldest post in the window ages out, rather than
   *  failing the target. */
  private async rateLimitDelay(accountId: string): Promise<number | null> {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const row = await this.env.DB.prepare(
      `SELECT COUNT(*) AS used, MIN(published_at) AS oldest
         FROM post_targets
        WHERE account_id = ? AND state = 'published' AND published_at > ?`,
    )
      .bind(accountId, since)
      .first<{ used: number; oldest: string | null }>();

    const used = row?.used ?? 0;
    if (used < LIMITS.postsPer24h) return null;

    const oldest = row?.oldest ? Date.parse(row.oldest) : Date.now();
    const clearsAt = oldest + 24 * 60 * 60 * 1000 + 60_000;
    return Math.max(clearsAt - Date.now(), POLL_INTERVAL_MS);
  }

  /* ---- introspection, for tests and the UI ------------------------------ */

  async queueSnapshot(): Promise<QueueRow[]> {
    return this.sql
      .exec<QueueRow>(`SELECT * FROM queue ORDER BY scheduled_at ASC`)
      .toArray();
  }

  async nextAlarm(): Promise<number | null> {
    return this.ctx.storage.getAlarm();
  }
}
