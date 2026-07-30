import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers.js";

/* The write-through bridge from the localStorage workspace to D1.
 *
 * The property that matters here is that re-syncing is safe. The frontend
 * pushes a piece every time it is scheduled or published, and an edit-then-
 * reschedule must not create a second target, nor reset one that is already
 * on its way to Instagram. */

const ORIGIN = "https://test.example.com";
const PASSWORD = "correct-horse-battery-staple";

/* D1 is not reset between tests in this pool version, so every test works on
 * its own ids rather than sharing them and inheriting the previous test's
 * state. */
let seq = 0;
const fresh = () => {
  const n = ++seq;
  return { postId: `p-${n}`, accountId: `a-${n}`, externalId: `ig-${n}` };
};

async function signIn(): Promise<string> {
  const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

async function seedAccount(id: string, externalId: string): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO accounts (id, platform, external_id, handle, access_token_enc,
                           scopes, status, connected_at)
     VALUES (?, 'instagram', ?, 'testhandle', 'x', '[]', 'active', ?)`,
  )
    .bind(id, externalId, new Date().toISOString())
    .run();
}

const putPost = (cookie: string, body: unknown) =>
  SELF.fetch(`${ORIGIN}/api/posts`, {
    method: "PUT",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

const targetIds = async (response: Response) =>
  ((await response.json()) as { targets: Array<{ id: string }> }).targets;

describe("PUT /api/posts", () => {
  beforeEach(applySchema);

  it("creates the post, its project and one target per account", async () => {
    const cookie = await signIn();
    const one = fresh();
    const two = fresh();
    await seedAccount(one.accountId, one.externalId);
    await seedAccount(two.accountId, two.externalId);

    const response = await putPost(cookie, {
      postId: one.postId,
      kind: "carousel",
      caption: "hello",
      projectId: "personal",
      targets: [{ accountId: one.accountId }, { accountId: two.accountId }],
    });

    expect(response.status).toBe(200);
    expect(await targetIds(response)).toHaveLength(2);

    // The project row is created on demand — the frontend invents project ids
    // locally and there is no separate call that would create it.
    const project = await env.DB.prepare(
      `SELECT id FROM projects WHERE id = 'personal'`,
    ).first();
    expect(project).not.toBeNull();

    const post = await env.DB.prepare(
      `SELECT kind, caption, project_id FROM posts WHERE id = ?`,
    )
      .bind(one.postId)
      .first<{ kind: string; caption: string; project_id: string }>();
    expect(post).toMatchObject({
      kind: "carousel",
      caption: "hello",
      project_id: "personal",
    });
  });

  it("is idempotent — re-syncing edits in place, it does not duplicate", async () => {
    const cookie = await signIn();
    const { postId, accountId, externalId } = fresh();
    await seedAccount(accountId, externalId);

    const first = await putPost(cookie, {
      postId,
      kind: "image",
      caption: "first draft",
      targets: [{ accountId }],
    });
    const second = await putPost(cookie, {
      postId,
      kind: "image",
      caption: "edited",
      targets: [{ accountId }],
    });

    expect((await targetIds(second))[0].id).toBe((await targetIds(first))[0].id);

    const count = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM post_targets WHERE post_id = ?`,
    )
      .bind(postId)
      .first<{ n: number }>();
    expect(count!.n).toBe(1);

    const post = await env.DB.prepare(`SELECT caption FROM posts WHERE id = ?`)
      .bind(postId)
      .first<{ caption: string }>();
    expect(post!.caption).toBe("edited");
  });

  it.each(["publishing", "published", "needs_review"])(
    "leaves a %s target alone rather than resetting it",
    async (state) => {
      const cookie = await signIn();
      const { postId, accountId, externalId } = fresh();
      await seedAccount(accountId, externalId);

      await putPost(cookie, {
        postId,
        kind: "image",
        caption: "c",
        targets: [{ accountId, scheduledAt: "2026-08-01T10:00:00.000Z" }],
      });
      await env.DB.prepare(
        `UPDATE post_targets SET state = ? WHERE post_id = ?`,
      )
        .bind(state, postId)
        .run();

      // The dangerous case: an edit arriving while the target is in flight.
      // Resetting it here would schedule a second publish of something that
      // may already be on Instagram.
      await putPost(cookie, {
        postId,
        kind: "image",
        caption: "edited after it left",
        targets: [{ accountId, scheduledAt: "2026-09-01T10:00:00.000Z" }],
      });

      const row = await env.DB.prepare(
        `SELECT state, scheduled_at FROM post_targets WHERE post_id = ?`,
      )
        .bind(postId)
        .first<{ state: string; scheduled_at: string }>();
      expect(row!.state).toBe(state);
      expect(row!.scheduled_at).toBe("2026-08-01T10:00:00.000Z");
    },
  );

  it("reschedules a target that has not left yet", async () => {
    const cookie = await signIn();
    const { postId, accountId, externalId } = fresh();
    await seedAccount(accountId, externalId);

    await putPost(cookie, {
      postId,
      kind: "image",
      caption: "c",
      targets: [{ accountId, scheduledAt: "2026-08-01T10:00:00.000Z" }],
    });
    await putPost(cookie, {
      postId,
      kind: "image",
      caption: "c",
      targets: [{ accountId, scheduledAt: "2026-09-01T10:00:00.000Z" }],
    });

    const row = await env.DB.prepare(
      `SELECT scheduled_at FROM post_targets WHERE post_id = ?`,
    )
      .bind(postId)
      .first<{ scheduled_at: string }>();
    expect(row!.scheduled_at).toBe("2026-09-01T10:00:00.000Z");
  });

  it("refuses without a session", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/posts`, {
      method: "PUT",
      body: "{}",
    });
    expect(response.status).toBe(401);
  });

  it("rejects a body with no postId", async () => {
    const cookie = await signIn();
    const response = await putPost(cookie, { kind: "image", targets: [] });
    expect(response.status).toBe(400);
  });
});

describe("GET /api/targets", () => {
  beforeEach(applySchema);

  it("reports progress with the handle, and nothing else from accounts", async () => {
    const cookie = await signIn();
    const { postId, accountId, externalId } = fresh();
    await seedAccount(accountId, externalId);

    await putPost(cookie, {
      postId,
      kind: "image",
      caption: "c",
      targets: [{ accountId }],
    });
    await env.DB.prepare(
      `UPDATE post_targets SET state = 'failed', error_reason = 'nope'
        WHERE post_id = ?`,
    )
      .bind(postId)
      .run();

    const response = await SELF.fetch(
      `${ORIGIN}/api/targets?postId=${postId}`,
      { headers: { cookie } },
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(text).targets[0]).toMatchObject({
      state: "failed",
      error_reason: "nope",
      handle: "testhandle",
    });
    expect(text).not.toContain("access_token_enc");
  });

  it("refuses without a session", async () => {
    const response = await SELF.fetch(`${ORIGIN}/api/targets`);
    expect(response.status).toBe(401);
  });
});
