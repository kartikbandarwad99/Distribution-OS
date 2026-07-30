import { env, runInDurableObject, runDurableObjectAlarm } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applySchema,
  publishCalls,
  scheduler,
  seed,
  stubMeta,
  targetRow,
  type Fixture,
  type MetaStub,
} from "./helpers.js";

/* `runDurableObjectAlarm()` fires a scheduled alarm immediately instead of
 * waiting for the timer, which is what makes a state machine whose steps are
 * thirty seconds apart testable in milliseconds. Each call here is one wake —
 * so the number of calls a test needs is also a direct check that the object
 * really does advance one step per wake and then go back to sleep. */

let meta: MetaStub;

beforeEach(applySchema);
afterEach(() => meta?.restore());

/** Pulls a target's next attention time back into the past, so the next alarm
 *  picks it up without the test waiting out a real thirty-second backoff. */
async function makeDue(fixture: Fixture): Promise<void> {
  await runInDurableObject(scheduler(fixture), (_instance, state) => {
    state.storage.sql.exec(
      `UPDATE queue SET scheduled_at = ? WHERE target_id = ?`,
      new Date(Date.now() - 1000).toISOString(),
      fixture.targetId,
    );
  });
}

describe("AccountScheduler", () => {
  it("stores a timer rather than running anything, when a post is far off", async () => {
    meta = stubMeta();
    const future = new Date(Date.now() + 21 * 24 * 3600_000).toISOString();
    const fixture = await seed({ scheduledAt: future });

    await scheduler(fixture).enqueue(fixture.accountId, fixture.targetId, future);

    expect(await scheduler(fixture).nextAlarm()).toBe(Date.parse(future));
    // Three weeks out, and nothing has been said to Instagram.
    expect(meta.calls).toHaveLength(0);
  });

  it("advances one step per wake and publishes an image", async () => {
    meta = stubMeta({ finishAfterPolls: 1 });
    const fixture = await seed();

    // Enqueued for later, then pulled forward, so the only thing that advances
    // this target is the alarm the test fires. Enqueueing it as already due
    // lets the runtime fire the alarm on its own and race the assertion.
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date(Date.now() + 3600_000).toISOString(),
    );
    expect((await targetRow(fixture))!.state).toBe("queued");

    // Wake 1: create the container. Not published yet — this is the property
    // that keeps a Durable Object's billed wall-clock time near zero.
    await makeDue(fixture);
    await runDurableObjectAlarm(scheduler(fixture));
    expect((await targetRow(fixture))!.state).toBe("creating");
    expect((await targetRow(fixture))!.container_id).toBeTruthy();
    expect(publishCalls(meta)).toHaveLength(0);

    for (let i = 0; i < 12; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      if ((await targetRow(fixture))!.state === "published") break;
    }

    const row = (await targetRow(fixture))!;
    expect(row.state).toBe("published");
    expect(row.ig_media_id).toBe("ig-media-999");
    expect(row.platform_post_id).toBe("ig-media-999");
    expect(row.published_at).toBeTruthy();
    expect(publishCalls(meta)).toHaveLength(1);
  });

  it("polls a container that is not FINISHED instead of waiting on it", async () => {
    meta = stubMeta({ finishAfterPolls: 3 });
    const fixture = await seed();
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date().toISOString(),
    );

    for (let i = 0; i < 12; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      if ((await targetRow(fixture))!.state === "published") break;
    }

    const statusChecks = meta.calls.filter((call) =>
      call.url.includes("status_code"),
    );
    // Four checks, each on its own wake, none of them a sleep.
    expect(statusChecks).toHaveLength(4);
    expect((await targetRow(fixture))!.state).toBe("published");
  });

  it("publishes a carousel: children, then parent, then publish", async () => {
    meta = stubMeta();
    const fixture = await seed({ kind: "carousel", mediaCount: 3 });
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date().toISOString(),
    );

    for (let i = 0; i < 12; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      if ((await targetRow(fixture))!.state === "published") break;
    }

    const children = meta.calls.filter((call) =>
      call.body.includes("is_carousel_item=true"),
    );
    const parents = meta.calls.filter((call) =>
      call.body.includes("media_type=CAROUSEL"),
    );
    expect(children).toHaveLength(3);
    expect(parents).toHaveLength(1);
    expect(publishCalls(meta)).toHaveLength(1);
    expect((await targetRow(fixture))!.state).toBe("published");
  });

  it("deletes the R2 object once the bytes are on Instagram's CDN", async () => {
    meta = stubMeta();
    const fixture = await seed();
    const key = fixture.mediaKeys[0];
    expect(await env.MEDIA.get(key)).not.toBeNull();

    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date().toISOString(),
    );
    for (let i = 0; i < 12; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      if ((await targetRow(fixture))!.state === "published") break;
    }

    expect(await env.MEDIA.get(key)).toBeNull();
    const media = await env.DB.prepare(
      `SELECT evicted_at FROM media WHERE r2_key = ?`,
    )
      .bind(key)
      .first<{ evicted_at: string | null }>();
    expect(media!.evicted_at).toBeTruthy();
  });

  it("runs the same steps for Publish now as for a timer", async () => {
    meta = stubMeta();
    const fixture = await seed({
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    });

    // publishNow drives the first step itself, then the rest is alarms — the
    // same code either way, which is the whole point of routing it through the
    // queue rather than a separate publish path.
    await scheduler(fixture).publishNow(fixture.accountId, fixture.targetId);
    for (let i = 0; i < 12; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      if ((await targetRow(fixture))!.state === "published") break;
    }

    expect((await targetRow(fixture))!.state).toBe("published");
    expect(publishCalls(meta)).toHaveLength(1);
  });

  it("forgets a cancelled target and clears the alarm", async () => {
    meta = stubMeta();
    const future = new Date(Date.now() + 3600_000).toISOString();
    const fixture = await seed({ scheduledAt: future });

    await scheduler(fixture).enqueue(fixture.accountId, fixture.targetId, future);
    expect(await scheduler(fixture).nextAlarm()).not.toBeNull();

    await scheduler(fixture).cancel(fixture.targetId);
    expect(await scheduler(fixture).nextAlarm()).toBeNull();
    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(0);
  });

  it("re-admits a target the object has lost, when the sweep pokes it", async () => {
    meta = stubMeta();
    const fixture = await seed({
      scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
    });
    // D1 says this is queued; the object has never heard of it. That is
    // exactly the state the quarter-hourly sweep exists to repair.
    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(0);

    await scheduler(fixture).poke(fixture.accountId);

    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(1);
    expect(await scheduler(fixture).nextAlarm()).not.toBeNull();
    // The poke repairs; it does not publish.
    expect(publishCalls(meta)).toHaveLength(0);
  });
});

describe("the at-least-once guard", () => {
  /* THE test in this file.
   *
   * Cloudflare's docs are explicit that an alarm has at-least-once execution
   * and that "in rare cases, alarms may fire more than once". Single-threading
   * stops two concurrent publishes; it does nothing about a retry after a
   * partial success — media_publish returns 200, the object dies before
   * recording the id, the alarm retries, and the same photo posts twice.
   *
   * A duplicate post to a real Instagram account cannot be taken back. A post
   * that needs one manual glance can. */

  it("does not republish when a previous attempt may have succeeded", async () => {
    meta = stubMeta();
    const fixture = await seed();
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date().toISOString(),
    );

    // Reproduce the dangerous state directly: the write-ahead marker is set,
    // no media id was ever recorded. This is what an object looks like after
    // it crashed somewhere between the two.
    await runInDurableObject(scheduler(fixture), (_instance, state) => {
      state.storage.sql.exec(
        `UPDATE queue SET state = 'publishing', publish_started_at = ?,
                          container_id = 'container-1', scheduled_at = ?
          WHERE target_id = ?`,
        new Date().toISOString(),
        new Date(Date.now() - 1000).toISOString(),
        fixture.targetId,
      );
    });

    await runDurableObjectAlarm(scheduler(fixture));

    // The assertion that matters is this one, not the state below it.
    expect(publishCalls(meta)).toHaveLength(0);

    const row = (await targetRow(fixture))!;
    expect(row.state).toBe("needs_review");
    expect(row.error_reason).toMatch(/may have posted/i);
  });

  it("writes the marker before calling media_publish, never after", async () => {
    meta = stubMeta({ publishFails: true });
    const fixture = await seed();
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date().toISOString(),
    );

    // Drive it to the point of publishing, where the stubbed call throws — a
    // stand-in for the ambiguous case, a request that may or may not have
    // reached Meta.
    for (let i = 0; i < 8; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
      const queue = await scheduler(fixture).queueSnapshot();
      if (queue[0]?.publish_started_at) break;
    }

    const row = (await scheduler(fixture).queueSnapshot())[0]!;
    expect(row.publish_started_at).toBeTruthy();
    expect(row.ig_media_id).toBeNull();

    // And the retry that follows must not publish.
    meta.restore();
    meta = stubMeta();
    await makeDue(fixture);
    await runDurableObjectAlarm(scheduler(fixture));

    expect(publishCalls(meta)).toHaveLength(0);
    expect((await targetRow(fixture))!.state).toBe("needs_review");
  });
});

describe("the per-account rate limit", () => {
  it("waits for the window rather than failing at 25 posts in 24 hours", async () => {
    meta = stubMeta();
    const fixture = await seed();

    const oldest = new Date(Date.now() - 20 * 3600_000).toISOString();
    for (let i = 0; i < 25; i++) {
      await env.DB.prepare(
        `INSERT INTO posts (id, kind, caption, created_at, updated_at)
         VALUES (?, 'image', '', ?, ?)`,
      )
        .bind(`filler-p${i}`, oldest, oldest)
        .run();
      await env.DB.prepare(
        `INSERT INTO post_targets (id, post_id, account_id, state, published_at)
         VALUES (?, ?, ?, 'published', ?)`,
      )
        .bind(
          `filler-t${i}`,
          `filler-p${i}`,
          fixture.accountId,
          i === 0 ? oldest : new Date().toISOString(),
        )
        .run();
    }

    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date(Date.now() + 3600_000).toISOString(),
    );
    await makeDue(fixture);
    await runDurableObjectAlarm(scheduler(fixture));

    // Nothing was created and nothing was published: the cap is checked before
    // any container exists, so hitting it reads as a limit rather than a
    // failure partway through a carousel.
    expect(meta.calls).toHaveLength(0);
    const row = (await targetRow(fixture))!;
    expect(row.state).toBe("queued");
    expect(row.error_reason).toMatch(/24 hours/);

    // And it is parked just past the moment the oldest post ages out, not
    // retried in a tight loop.
    const alarm = await scheduler(fixture).nextAlarm();
    expect(alarm).toBeGreaterThan(Date.now() + 3 * 3600_000);
  });
});

describe("failure handling", () => {
  it("parks a target after five failed attempts so the queue moves on", async () => {
    meta = stubMeta();
    const fixture = await seed();
    // A target with no publisher for its platform fails on every attempt,
    // which is the cheapest way to exercise the cap. Deleting the account
    // would not work: post_targets cascades on account_id, so the target
    // itself would disappear rather than fail.
    await env.DB.prepare(`UPDATE accounts SET platform = 'threads' WHERE id = ?`)
      .bind(fixture.accountId)
      .run();
    await scheduler(fixture).enqueue(
      fixture.accountId,
      fixture.targetId,
      new Date(Date.now() + 3600_000).toISOString(),
    );

    for (let i = 0; i < 5; i++) {
      await makeDue(fixture);
      await runDurableObjectAlarm(scheduler(fixture));
    }

    const row = (await targetRow(fixture))!;
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(5);
    expect(row.error_reason).toMatch(/No publisher for threads/i);
    expect(await scheduler(fixture).nextAlarm()).toBeNull();
  });
});
