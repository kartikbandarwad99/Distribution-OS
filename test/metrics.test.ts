import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applySchema } from "./helpers.js";

/* Reading numbers back off published media.
 *
 * The insights edge is the least stable surface Meta ships — metrics get
 * renamed and removed between versions, and the supported set differs per
 * media type. So the tests that matter here are not "it stores a number" but
 * the degradation ones: a rejected metric must cost that metric and nothing
 * else, and one account's dead token must not stop the others.
 */

let seq = 0;

/** A published target with a media id, which is what refresh looks for.
 *  Deliberately not helpers.seed(): that seeds a *queued* target, and the
 *  scopes it writes are '[]' — the exact condition that must be refused. */
async function seedPublished(
  options: { scopes?: string[]; status?: string } = {},
): Promise<{ accountId: string; postId: string; targetId: string; igMediaId: string }> {
  const n = ++seq;
  const accountId = `macct-${n}`;
  const postId = `mpost-${n}`;
  const targetId = `mtarget-${n}`;
  const igMediaId = `1789900000000${n}`;
  const now = new Date().toISOString();

  const { encryptToken } = await import("../worker/lib/crypto.js");
  const { config } = await import("../worker/lib/env.js");

  await env.DB.prepare(
    `INSERT INTO accounts (id, platform, external_id, handle, access_token_enc,
                           expires_at, scopes, status, connected_at)
     VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      accountId,
      `ext-${n}`,
      `handle${n}`,
      encryptToken("test-access-token", config(env).tokenEncKey),
      new Date(Date.now() + 60 * 24 * 3600_000).toISOString(),
      JSON.stringify(
        options.scopes ?? [
          "instagram_business_basic",
          "instagram_business_content_publish",
          "instagram_business_manage_insights",
        ],
      ),
      options.status ?? "active",
      now,
    )
    .run();

  await env.DB.prepare(
    `INSERT INTO posts (id, kind, caption, created_at, updated_at)
     VALUES (?, 'image', 'a caption', ?, ?)`,
  )
    .bind(postId, now, now)
    .run();

  await env.DB.prepare(
    `INSERT INTO post_targets (id, post_id, account_id, state, ig_media_id,
                               published_at)
     VALUES (?, ?, ?, 'published', ?, ?)`,
  )
    .bind(targetId, postId, accountId, igMediaId, now)
    .run();

  return { accountId, postId, targetId, igMediaId };
}

interface InsightsStub {
  /** Metric names Instagram will reject, by name. */
  reject: Set<string>;
  calls: string[];
  restore(): void;
}

function stubInsights(
  options: {
    reject?: string[];
    nodeFails?: string;
    likeCount?: number;
  } = {},
): InsightsStub {
  const original = globalThis.fetch;
  const calls: string[] = [];
  const reject = new Set(options.reject ?? []);

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    calls.push(url);

    if (!url.startsWith("https://graph.instagram.com")) {
      return original(input as RequestInfo, init);
    }

    if (url.includes("/insights")) {
      const asked =
        new URL(url).searchParams.get("metric")?.split(",") ?? [];
      const bad = asked.find((metric) => reject.has(metric));
      if (bad) {
        return Response.json(
          {
            error: {
              message: `(#100) The value must be a valid insights metric: ${bad}`,
            },
          },
          { status: 400 },
        );
      }
      return Response.json({
        data: asked.map((name, i) => ({
          name,
          values: [{ value: (i + 1) * 10 }],
        })),
      });
    }

    // The media node itself.
    if (options.nodeFails) {
      return Response.json(
        { error: { message: options.nodeFails } },
        { status: 400 },
      );
    }
    return Response.json({
      like_count: options.likeCount ?? 42,
      comments_count: 7,
      media_type: "IMAGE",
      permalink: "https://instagram.com/p/abc",
      timestamp: new Date().toISOString(),
    });
  }) as typeof fetch;

  return { reject, calls, restore: () => { globalThis.fetch = original; } };
}

const ORIGIN = "https://test.example.com";
const PASSWORD = "correct-horse-battery-staple";

/** Both routes are behind the session gate — metrics name real accounts and
 *  real reach, and are nobody else's business. */
async function signIn(): Promise<string> {
  const response = await SELF.fetch(`${ORIGIN}/api/auth/login`, {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  return response.headers.get("set-cookie")!.split(";")[0];
}

const refresh = async (body: unknown = {}) =>
  SELF.fetch(`${ORIGIN}/api/metrics/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: await signIn() },
    body: JSON.stringify(body),
  });

const metricRows = (targetId: string) =>
  env.DB.prepare(
    `SELECT * FROM post_metrics WHERE target_id = ? ORDER BY fetched_at DESC`,
  )
    .bind(targetId)
    .all<Record<string, unknown>>();

describe("refreshing metrics", () => {
  let stub: InsightsStub;

  beforeEach(async () => {
    await applySchema();
  });
  afterEach(() => stub?.restore());

  it("stores what Instagram reports", async () => {
    stub = stubInsights();
    const fixture = await seedPublished();

    const response = await refresh({ accountId: fixture.accountId });
    expect(response.status).toBe(200);
    const result = (await response.json()) as { updated: number };
    expect(result.updated).toBe(1);

    const { results } = await metricRows(fixture.targetId);
    expect(results).toHaveLength(1);
    // like_count and comments_count come off the media node, not insights.
    expect(results[0].likes).toBe(42);
    expect(results[0].comments).toBe(7);
    expect(results[0].reach).toBe(10);
    expect(results[0].raw).toContain("permalink");
  });

  /* The degradation that matters. A carousel reports no `shares`; asking for
   * it fails the whole call. Losing reach and views because of that would make
   * analytics silently useless for carousels. */
  it("drops a metric Instagram rejects and keeps the rest", async () => {
    stub = stubInsights({ reject: ["shares"] });
    const fixture = await seedPublished();

    await refresh({ accountId: fixture.accountId });

    const { results } = await metricRows(fixture.targetId);
    expect(results).toHaveLength(1);
    expect(results[0].shares).toBeNull();
    expect(results[0].reach).not.toBeNull();
    expect(results[0].likes).toBe(42);
  });

  /* Absent is not zero. A chart that renders a missing metric as 0 tells the
   * user their post got no shares, which is a different and false claim. */
  it("records an unsupported metric as null rather than zero", async () => {
    stub = stubInsights({ reject: ["saved"] });
    const fixture = await seedPublished();

    await refresh({ accountId: fixture.accountId });

    const { results } = await metricRows(fixture.targetId);
    expect(results[0].saved).toBeNull();
    expect(results[0].saved).not.toBe(0);
  });

  it("refuses an account connected without the insights scope", async () => {
    stub = stubInsights();
    const fixture = await seedPublished({
      scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    });

    const response = await refresh({ accountId: fixture.accountId });
    const result = (await response.json()) as {
      updated: number;
      problems: Array<{ reason: string }>;
    };

    expect(result.updated).toBe(0);
    expect(result.problems[0].reason).toMatch(/reconnect/i);
    // And it must not have gone to Instagram at all — asking with a token that
    // cannot answer just burns rate limit.
    expect(stub.calls.filter((c) => c.includes("graph.instagram"))).toHaveLength(
      0,
    );
  });

  /* The multi-account failure mode: one revoked token must cost one account,
   * not the whole refresh. */
  it("marks a dead token expired and keeps going", async () => {
    stub = stubInsights({ nodeFails: "Error validating access token: expired" });
    const fixture = await seedPublished();

    const response = await refresh({ accountId: fixture.accountId });
    const result = (await response.json()) as {
      problems: Array<{ reason: string }>;
    };
    expect(result.problems).toHaveLength(1);

    const account = await env.DB.prepare(
      `SELECT status FROM accounts WHERE id = ?`,
    )
      .bind(fixture.accountId)
      .first<{ status: string }>();
    expect(account?.status).toBe("expired");
  });

  it("skips a target measured within the hour unless forced", async () => {
    stub = stubInsights();
    const fixture = await seedPublished();

    await refresh({ accountId: fixture.accountId });
    const again = await refresh({ accountId: fixture.accountId });
    expect(((await again.json()) as { considered: number }).considered).toBe(0);

    const forced = await refresh({ accountId: fixture.accountId, force: true });
    expect(((await forced.json()) as { considered: number }).considered).toBe(1);
  });

  /* History is the reason this is an append table. If a second reading
   * overwrote the first, "how did this post get here" becomes unanswerable. */
  it("appends a second reading rather than replacing the first", async () => {
    stub = stubInsights();
    const fixture = await seedPublished();

    await refresh({ accountId: fixture.accountId });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await refresh({ accountId: fixture.accountId, force: true });

    const { results } = await metricRows(fixture.targetId);
    expect(results.length).toBeGreaterThan(1);
  });
});

describe("reading metrics back", () => {
  let stub: InsightsStub;

  beforeEach(async () => {
    await applySchema();
  });
  afterEach(() => stub?.restore());

  it("returns only the newest reading per target", async () => {
    stub = stubInsights();
    const fixture = await seedPublished();

    await refresh({ accountId: fixture.accountId });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await refresh({ accountId: fixture.accountId, force: true });

    const response = await SELF.fetch(
      `${ORIGIN}/api/metrics?postId=${fixture.postId}`,
      { headers: { cookie: await signIn() } },
    );
    const { metrics } = (await response.json()) as {
      metrics: Array<{ target_id: string; post_id: string }>;
    };

    const mine = metrics.filter((m) => m.target_id === fixture.targetId);
    expect(mine).toHaveLength(1);
    expect(mine[0].post_id).toBe(fixture.postId);
  });

  it("does not need Instagram to be reachable", async () => {
    stub = stubInsights();
    const fixture = await seedPublished();
    await refresh({ accountId: fixture.accountId });

    // The whole point of splitting read from refresh: rendering a chart must
    // not depend on Meta answering.
    stub.restore();
    stub = stubInsights({ nodeFails: "Instagram is down" });

    const response = await SELF.fetch(`${ORIGIN}/api/metrics`, {
      headers: { cookie: await signIn() },
    });
    expect(response.status).toBe(200);
    const { metrics } = (await response.json()) as { metrics: unknown[] };
    expect(metrics.length).toBeGreaterThan(0);
  });
});
