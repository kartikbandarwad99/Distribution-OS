import { env } from "cloudflare:test";
// Inlined by Vite at transform time. Reading it with node:fs at runtime does
// not work: the test runs inside workerd, which has no view of the host
// filesystem.
import SCHEMA from "../db/schema.sql?raw";

/* D1's `exec` splits input on newlines, which multi-line CREATE TABLE
 * statements and SQL comments both defeat. Stripping comments and splitting on
 * `;` runs the real db/schema.sql rather than a hand-maintained copy — which is
 * the point: a schema that drifts from the one that ships is worse than no test
 * at all. */

export async function applySchema(): Promise<void> {
  const statements = SCHEMA.replace(/^\s*--.*$/gm, "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await env.DB.prepare(statement).run();
  }
}

/* D1 and Durable Object storage are NOT reset between tests in this pool
 * version, so every test gets its own ids instead. That also gives each test
 * its own scheduler instance — `idFromName(accountId)` — which is what keeps
 * one test's queue out of the next one's alarm. */
let seq = 0;

export interface Fixture {
  accountId: string;
  postId: string;
  targetId: string;
  igUserId: string;
  mediaKeys: string[];
}

/** A connected Instagram account, one post, one queued target. The access
 *  token is encrypted with the same code the real flow uses. */
export async function seed(
  options: {
    kind?: "image" | "carousel" | "reel";
    mediaCount?: number;
    scheduledAt?: string;
  } = {},
): Promise<Fixture> {
  const n = ++seq;
  const accountId = `acct-${n}`;
  const postId = `post-${n}`;
  const targetId = `target-${n}`;
  const igUserId = `1784140000000000${n}`;
  const { kind = "image", mediaCount = 1, scheduledAt } = options;
  const now = new Date().toISOString();

  const { encryptToken } = await import("../worker/lib/crypto.js");
  const { config } = await import("../worker/lib/env.js");
  const encrypted = encryptToken("test-access-token", config(env).tokenEncKey);

  await env.DB.prepare(
    `INSERT INTO accounts (id, platform, external_id, handle, access_token_enc,
                           expires_at, scopes, status, connected_at)
     VALUES (?, 'instagram', ?, 'testhandle', ?, ?, '[]', 'active', ?)`,
  )
    .bind(
      accountId,
      igUserId,
      encrypted,
      new Date(Date.now() + 60 * 24 * 3600_000).toISOString(),
      now,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO posts (id, kind, caption, created_at, updated_at)
     VALUES (?, ?, 'a caption', ?, ?)`,
  )
    .bind(postId, kind, now, now)
    .run();

  const mediaKeys: string[] = [];
  for (let i = 0; i < mediaCount; i++) {
    const key = `posts/${postId}/0${i}-a.jpg`;
    mediaKeys.push(key);
    await env.DB.prepare(
      `INSERT INTO media (id, post_id, r2_key, mime, bytes, position)
       VALUES (?, ?, ?, 'image/jpeg', 1000, ?)`,
    )
      .bind(`media-${n}-${i}`, postId, key, i)
      .run();
    await env.MEDIA.put(key, "not-really-a-jpeg");
  }

  await env.DB.prepare(
    `INSERT INTO post_targets (id, post_id, account_id, scheduled_at, state)
     VALUES (?, ?, ?, ?, 'queued')`,
  )
    .bind(targetId, postId, accountId, scheduledAt ?? now)
    .run();

  return { accountId, postId, targetId, igUserId, mediaKeys };
}

/* A stand-in for the Meta Graph API.
 *
 * There is no Instagram sandbox, so every test that exercises the publish path
 * has to stub it. Each call is recorded, which is how the idempotency test
 * proves the thing that matters: not merely that the target ended up in
 * `needs_review`, but that `media_publish` was never called a second time. */
export interface MetaCall {
  url: string;
  method: string;
  body: string;
}

export interface MetaStub {
  calls: MetaCall[];
  /** Containers report IN_PROGRESS until this many status checks have happened. */
  finishAfterPolls: number;
  restore(): void;
}

export function stubMeta(
  options: { finishAfterPolls?: number; publishFails?: boolean } = {},
): MetaStub {
  const original = globalThis.fetch;
  const calls: MetaCall[] = [];
  const pollsByContainer = new Map<string, number>();
  const finishAfterPolls = options.finishAfterPolls ?? 0;
  let containerSeq = 0;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url, method, body });

    if (!url.startsWith("https://graph.instagram.com")) {
      return original(input as RequestInfo, init);
    }

    if (url.includes("/media_publish")) {
      if (options.publishFails) throw new Error("network died mid-publish");
      return Response.json({ id: "ig-media-999" });
    }
    if (method === "POST" && url.includes("/media")) {
      return Response.json({ id: `container-${++containerSeq}` });
    }
    if (url.includes("status_code")) {
      const containerId = url.split("/").pop()!.split("?")[0];
      const seen = (pollsByContainer.get(containerId) ?? 0) + 1;
      pollsByContainer.set(containerId, seen);
      return Response.json({
        status_code: seen > finishAfterPolls ? "FINISHED" : "IN_PROGRESS",
      });
    }
    return Response.json({});
  }) as typeof fetch;

  return {
    calls,
    finishAfterPolls,
    restore: () => {
      globalThis.fetch = original;
    },
  };
}

export const publishCalls = (stub: MetaStub) =>
  stub.calls.filter((call) => call.url.includes("/media_publish"));

export const scheduler = (fixture: Fixture) =>
  env.ACCOUNT_SCHEDULER.get(
    env.ACCOUNT_SCHEDULER.idFromName(fixture.accountId),
  );

export const targetRow = (fixture: Fixture) =>
  env.DB.prepare(`SELECT * FROM post_targets WHERE id = ?`)
    .bind(fixture.targetId)
    .first<Record<string, unknown>>();
