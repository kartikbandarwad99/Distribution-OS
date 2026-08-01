import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers.js";

/* POST /api/schedule refusing a time that has already passed.
 *
 * This is a regression test for a real incident, and the mechanism is worth
 * stating because the failure was silent. `AccountScheduler.rearm` sets the
 * alarm to `Math.max(scheduled_at, Date.now())`. That clamp is correct for a
 * target that fell slightly behind — a deploy, a retry — but it means any
 * timestamp in the past is indistinguishable from "publish immediately".
 *
 * A user picked 12:22 AM from the native datetime picker at 12:19 PM. Twelve
 * hours in the past, one arrow-key from the intended value, and it read as a
 * perfectly ordinary future time on the card. The post went out sixty seconds
 * later. There is no unsend on Instagram, so the guard belongs here, in front
 * of the clamp, rather than in the UI alone.
 */

const ORIGIN = "https://test.example.com";
const PASSWORD = "correct-horse-battery-staple";

let seq = 0;
const fresh = () => {
  const n = ++seq;
  return { postId: `sg-${n}`, accountId: `sga-${n}`, externalId: `sgig-${n}` };
};

async function signIn(): Promise<string> {
  const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

/** A connected account, a post, and one draft target ready to be scheduled. */
async function seedTarget(): Promise<{ cookie: string; targetId: string }> {
  const cookie = await signIn();
  const { postId, accountId, externalId } = fresh();

  await env.DB.prepare(
    `INSERT INTO accounts (id, platform, external_id, handle, access_token_enc,
                           scopes, status, connected_at)
     VALUES (?, 'instagram', ?, 'testhandle', 'x', '[]', 'active', ?)`,
  )
    .bind(accountId, externalId, new Date().toISOString())
    .run();

  const response = await SELF.fetch(`${ORIGIN}/api/posts`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({
      postId,
      kind: "image",
      caption: "c",
      targets: [{ accountId }],
    }),
  });
  const { targets } = (await response.json()) as {
    targets: Array<{ id: string }>;
  };
  return { cookie, targetId: targets[0].id };
}

const schedule = (cookie: string, targetId: string, scheduledAt: string) =>
  SELF.fetch(`${ORIGIN}/api/schedule`, {
    method: "POST",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ targetId, scheduledAt }),
  });

const stateOf = (targetId: string) =>
  env.DB.prepare(
    `SELECT state, scheduled_at FROM post_targets WHERE id = ?`,
  )
    .bind(targetId)
    .first<{ state: string; scheduled_at: string | null }>();

describe("POST /api/schedule — past times", () => {
  beforeEach(applySchema);

  it("refuses a time twelve hours in the past", async () => {
    const { cookie, targetId } = await seedTarget();
    const past = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();

    const response = await schedule(cookie, targetId, past);
    expect(response.status).toBe(400);
    expect((await response.json()) as { error: string }).toMatchObject({
      error: expect.stringContaining("already passed"),
    });
  });

  it("leaves the target untouched when it refuses", async () => {
    const { cookie, targetId } = await seedTarget();
    const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    await schedule(cookie, targetId, past);

    // The critical assertion: not queued, so no alarm, so nothing publishes.
    const row = await stateOf(targetId);
    expect(row!.state).toBe("draft");
    expect(row!.scheduled_at).toBeNull();
  });

  it("accepts a time in the future", async () => {
    const { cookie, targetId } = await seedTarget();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const response = await schedule(cookie, targetId, future);
    expect(response.status).toBe(200);
    expect((await stateOf(targetId))!.state).toBe("queued");
  });

  /* Clock skew between a browser and this Worker is ordinary, and a user
     scheduling something for "one minute from now" should not be told their
     own clock is wrong. Anything inside the grace window is still honoured —
     `rearm`'s clamp then does the right thing and fires it at once. */
  it("tolerates a few seconds of clock skew", async () => {
    const { cookie, targetId } = await seedTarget();
    const barelyPast = new Date(Date.now() - 5_000).toISOString();

    const response = await schedule(cookie, targetId, barelyPast);
    expect(response.status).toBe(200);
    expect((await stateOf(targetId))!.state).toBe("queued");
  });

  it("still rejects a timestamp that is not a timestamp", async () => {
    const { cookie, targetId } = await seedTarget();
    const response = await schedule(cookie, targetId, "next tuesday-ish");
    expect(response.status).toBe(400);
  });
});
