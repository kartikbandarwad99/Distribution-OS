/* Publishes one target.
 *
 * Deliberately a single endpoint that takes a target id, rather than a
 * scheduler. A "Publish now" button and a cron tick both come through here, so
 * the thing proven manually is exactly the thing that runs on a timer later —
 * there is no second, untested path.
 *
 * The state machine is the point:
 *
 *   queued → publishing → published
 *                      ↘  failed
 *
 * The move to `publishing` is a conditional UPDATE, so two concurrent callers
 * cannot both claim the same target and post it twice. A failure records the
 * message and returns the row to `queued` so a retry is possible without a
 * manual reset — the desktop app's dedupe set got this wrong and made failed
 * publishes unretryable until restart. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { fail } from "./_lib/http.js";
import { sql } from "./_lib/db.js";
import { decryptToken } from "./_lib/crypto.js";
import { presignFetch } from "./_lib/r2.js";
import { publish as publishToInstagram, quotaUsage } from "./_lib/instagram.js";
import { env } from "./_lib/env.js";

const MAX_ATTEMPTS = 5;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "POST only." });
    return;
  }

  const targetId =
    (req.query.target as string) || (req.body as { targetId?: string })?.targetId;
  if (!targetId) {
    res.status(400).json({ error: "targetId is required." });
    return;
  }

  // The cron trigger is unauthenticated otherwise, and this endpoint posts to
  // the public internet — so it presents a shared secret.
  const secret = req.headers["x-cron-secret"];
  if (secret !== undefined && secret !== env.cronSecret) {
    res.status(401).json({ error: "Bad cron secret." });
    return;
  }

  const db = sql();

  try {
    // Claim it. `state = 'queued'` in the WHERE clause is the lock.
    const claimed = (await db`
      update post_targets
         set state = 'publishing', locked_at = now(), attempts = attempts + 1
       where id = ${targetId}
         and state in ('queued', 'draft')
      returning id, post_id, account_id, attempts
    `) as Array<{ id: string; post_id: string; account_id: string; attempts: number }>;

    if (claimed.length === 0) {
      res.status(409).json({
        error: "That target is already publishing, or has already been published.",
      });
      return;
    }
    const target = claimed[0];

    const [account] = (await db`
      select external_id, access_token_enc, expires_at, status, platform
        from accounts where id = ${target.account_id}
    `) as Array<{
      external_id: string;
      access_token_enc: string;
      expires_at: string | null;
      status: string;
      platform: string;
    }>;

    if (!account) throw new Error("That account no longer exists.");
    if (account.platform !== "instagram") {
      throw new Error(`No publisher for ${account.platform} yet.`);
    }
    if (account.expires_at && new Date(account.expires_at) < new Date()) {
      throw new Error(
        "This account's Instagram token has expired. Reconnect it in Settings.",
      );
    }

    const [post] = (await db`
      select kind, caption from posts where id = ${target.post_id}
    `) as Array<{ kind: "image" | "carousel" | "reel" | "text"; caption: string }>;

    if (post.kind === "text") {
      throw new Error("Instagram requires media — a text post cannot be published.");
    }

    const mediaRows = (await db`
      select r2_key from media
       where post_id = ${target.post_id}
       order by position asc
    `) as Array<{ r2_key: string }>;

    if (mediaRows.length === 0) throw new Error("This post has no media attached.");

    const accessToken = decryptToken(account.access_token_enc);

    // Checked before doing the work, so hitting the cap reads as a limit
    // rather than a failure partway through a carousel.
    const quota = await quotaUsage(account.external_id, accessToken);
    if (quota.used >= quota.limit) {
      throw new Error(
        `This account has published ${quota.used} of ${quota.limit} posts in the last 24 hours. Try again later.`,
      );
    }

    // Signed at the last possible moment so the clock starts as late as it can.
    const mediaUrls = await Promise.all(
      mediaRows.map((row) => presignFetch(row.r2_key)),
    );

    const mediaId = await publishToInstagram({
      igUserId: account.external_id,
      accessToken,
      caption: post.caption,
      mediaUrls,
      kind: post.kind,
    });

    await db`
      update post_targets
         set state = 'published', platform_post_id = ${mediaId},
             published_at = now(), locked_at = null, error = null
       where id = ${target.id}
    `;

    res.status(200).json({ ok: true, platformPostId: mediaId });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    // Back to `queued` while retries remain, so a transient failure heals
    // itself on the next tick instead of needing a human.
    await db`
      update post_targets
         set state = case when attempts >= ${MAX_ATTEMPTS} then 'failed' else 'queued' end,
             error = ${message},
             locked_at = null
       where id = ${targetId}
    `.catch(() => undefined);

    fail(res, error);
  }
}
