import { env, createExecutionContext } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema, seed, scheduler, stubMeta } from "./helpers.js";
import worker from "../worker/index.js";

/** The cron handler, invoked directly. `SELF.scheduled()` cannot be used here:
 *  the pool cannot serialise the stub across the test boundary. */
const runSweep = () =>
  worker.scheduled(
    { scheduledTime: Date.now(), cron: "*/15 * * * *", noRetry() {} },
    env,
    createExecutionContext(),
  );

/* The safety net. It is not wired to a cron trigger yet — that is step 10 of
 * HANDOFF.md, deliberately last — but the handler ships with the port, so it is
 * tested with the port.
 *
 * Two things must be true of it: it repairs a lost alarm, and it never
 * publishes. If it ever starts publishing, the polling design this replaced has
 * been rebuilt by accident. */

describe("the safety-net sweep", () => {
  beforeEach(applySchema);

  it("re-arms an account whose alarm was lost, without publishing", async () => {
    const meta = stubMeta();
    // Due six minutes ago: past the five-minute grace the sweep allows, so a
    // target still sitting in `queued` means an alarm went missing.
    const fixture = await seed({
      scheduledAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(0);

    await runSweep();

    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(1);
    expect(
      meta.calls.filter((call) => call.url.includes("/media_publish")),
    ).toHaveLength(0);
    meta.restore();
  });

  it("finds nothing on a healthy queue", async () => {
    const meta = stubMeta();
    // Scheduled for next week: not due, so not the sweep's business.
    const fixture = await seed({
      scheduledAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    });

    await runSweep();

    // The queue is the assertion. Not `meta.calls`: an alarm repaired by an
    // earlier test in this file can fire while this one is running, and that
    // belongs to that account's object, not to this sweep.
    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(0);
    meta.restore();
  });

  it("ignores targets that are already finished", async () => {
    const meta = stubMeta();
    const fixture = await seed({
      scheduledAt: new Date(Date.now() - 6 * 60_000).toISOString(),
    });
    await env.DB.prepare(
      `UPDATE post_targets SET state = 'published' WHERE id = ?`,
    )
      .bind(fixture.targetId)
      .run();

    await runSweep();

    expect(await scheduler(fixture).queueSnapshot()).toHaveLength(0);
    meta.restore();
  });
});
