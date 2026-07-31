import { env, SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers.js";

/* DELETE /api/accounts.
 *
 * The bug this route exists to fix was not subtle: there was no way to remove
 * a connection at all. The Settings trash icon deleted the local channel, the
 * server row survived, and `useServerAccounts` mirrored it straight back into
 * a new channel on the next load — so disconnecting looked like it worked and
 * then undid itself.
 *
 * So the property under test is the blunt one: after this call, the row is
 * gone, and `GET /api/accounts` — the thing the mirror reads — does not
 * mention it. Everything else here guards the collateral damage. */

const ORIGIN = "https://test.example.com";
const PASSWORD = "correct-horse-battery-staple";

/* D1 is not reset between tests in this pool version, so each test works on
 * its own ids rather than inheriting the previous one's rows. */
let seq = 0;
const fresh = () => {
  const n = ++seq;
  return {
    accountId: `dis-a-${n}`,
    otherId: `dis-b-${n}`,
    postId: `dis-p-${n}`,
    targetId: `dis-t-${n}`,
    externalId: `dis-ig-${n}`,
  };
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

/** A published target with one metrics row — the history a disconnect
 *  destroys, and the reason the confirmation says so out loud. */
async function seedPublished(ids: ReturnType<typeof fresh>): Promise<void> {
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO posts (id, kind, caption, created_at, updated_at)
     VALUES (?, 'image', 'c', ?, ?)`,
  )
    .bind(ids.postId, now, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO post_targets (id, post_id, account_id, state, published_at)
     VALUES (?, ?, ?, 'published', ?)`,
  )
    .bind(ids.targetId, ids.postId, ids.accountId, now)
    .run();
  await env.DB.prepare(
    `INSERT INTO post_metrics (id, target_id, account_id, ig_media_id,
                               fetched_at, reach)
     VALUES (?, ?, ?, 'ig-1', ?, 42)`,
  )
    .bind(`dis-m-${seq}`, ids.targetId, ids.accountId, now)
    .run();
}

const disconnect = (cookie: string, id: string) =>
  SELF.fetch(`${ORIGIN}/api/accounts?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { cookie },
  });

const countWhere = async (table: string, accountId: string): Promise<number> => {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`,
  )
    .bind(accountId)
    .first<{ n: number }>();
  return row?.n ?? 0;
};

describe("disconnecting an account", () => {
  beforeEach(applySchema);

  it("removes the row, so the client cannot mirror it back", async () => {
    const ids = fresh();
    const cookie = await signIn();
    await seedAccount(ids.accountId, ids.externalId);

    const response = await disconnect(cookie, ids.accountId);
    expect(response.status).toBe(200);

    const listed = (await (
      await SELF.fetch(`${ORIGIN}/api/accounts`, { headers: { cookie } })
    ).json()) as { accounts: { id: string }[] };

    expect(listed.accounts.map((a) => a.id)).not.toContain(ids.accountId);
  });

  it("takes this account's targets and metrics with it", async () => {
    const ids = fresh();
    const cookie = await signIn();
    await seedAccount(ids.accountId, ids.externalId);
    await seedPublished(ids);

    const body = (await (await disconnect(cookie, ids.accountId)).json()) as {
      removedTargets: number;
      removedMetrics: number;
    };

    // Reported before deleting, so the UI can state the loss honestly.
    expect(body.removedTargets).toBe(1);
    expect(body.removedMetrics).toBe(1);

    expect(await countWhere("post_targets", ids.accountId)).toBe(0);
    expect(await countWhere("post_metrics", ids.accountId)).toBe(0);
  });

  it("leaves the other connected accounts alone", async () => {
    const ids = fresh();
    const cookie = await signIn();
    await seedAccount(ids.accountId, ids.externalId);
    await seedAccount(ids.otherId, `${ids.externalId}-other`);

    await disconnect(cookie, ids.accountId);

    const survivor = await env.DB.prepare(
      `SELECT id FROM accounts WHERE id = ?`,
    )
      .bind(ids.otherId)
      .first();
    expect(survivor).not.toBeNull();
  });

  /* A double click, or a second tab that already did it. Answering 404 would
   * make a Disconnect button that worked perfectly look broken. */
  it("treats an already-removed account as success", async () => {
    const cookie = await signIn();

    const body = (await (
      await disconnect(cookie, "an-account-that-never-existed")
    ).json()) as { ok: boolean; alreadyGone: boolean };

    expect(body.ok).toBe(true);
    expect(body.alreadyGone).toBe(true);
  });

  it("can be connected again afterwards", async () => {
    const ids = fresh();
    const cookie = await signIn();
    await seedAccount(ids.accountId, ids.externalId);
    await disconnect(cookie, ids.accountId);

    // The unique (platform, external_id) constraint is on the deleted row, so
    // this only works because the delete was real rather than a status flag.
    await seedAccount(`${ids.accountId}-again`, ids.externalId);

    const again = await env.DB.prepare(
      `SELECT id FROM accounts WHERE external_id = ?`,
    )
      .bind(ids.externalId)
      .first<{ id: string }>();
    expect(again?.id).toBe(`${ids.accountId}-again`);
  });

  it("refuses without a session", async () => {
    const ids = fresh();
    await seedAccount(ids.accountId, ids.externalId);

    const response = await SELF.fetch(
      `${ORIGIN}/api/accounts?id=${ids.accountId}`,
      { method: "DELETE" },
    );

    expect(response.status).toBe(401);
    expect(
      await env.DB.prepare(`SELECT id FROM accounts WHERE id = ?`)
        .bind(ids.accountId)
        .first(),
    ).not.toBeNull();
  });

  it("asks for an id rather than guessing", async () => {
    const cookie = await signIn();
    const response = await SELF.fetch(`${ORIGIN}/api/accounts`, {
      method: "DELETE",
      headers: { cookie },
    });
    expect(response.status).toBe(400);
  });
});
