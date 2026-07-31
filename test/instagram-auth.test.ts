import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { applySchema } from "./helpers.js";

/* The connect flow's last statement.
 *
 * The whole OAuth round trip can succeed — code exchanged, sixty-day token in
 * hand, profile resolved — and still lose the token on the INSERT, because
 * `accounts.project_id` is a foreign key and the frontend invents project ids
 * in localStorage that the server has never seen. That is not a hypothetical:
 * it is what a real connect attempt returned.
 *
 * These tests stub Meta so the failure is reproducible without an account. */

const STATE = "test-state-value";
const PROJECT_ID = "project-the-server-has-never-seen";

/* D1 is not reset between tests in this pool version — see helpers.ts — so
 * each test connects a different Instagram user rather than fighting over one
 * row that ON CONFLICT would carry across. */
let seq = 0;

/** Meta's three calls: code → short token, short → sixty-day, then the
 *  profile. Same monkeypatch approach as helpers.stubMeta, which the scheduler
 *  tests use. */
function stubOAuth(igUserId: string): () => void {
  const original = globalThis.fetch;

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();

    if (url.startsWith("https://api.instagram.com/oauth/access_token")) {
      return Response.json({ access_token: "short-lived", user_id: igUserId });
    }
    if (url.startsWith("https://graph.instagram.com/access_token")) {
      return Response.json({
        access_token: "long-lived-sixty-day-token",
        expires_in: 5183944,
      });
    }
    if (url.includes("graph.instagram.com") && url.includes("/me")) {
      return Response.json({ user_id: igUserId, username: "a.real.handle" });
    }
    return original(input as RequestInfo, init);
  }) as typeof fetch;

  return () => {
    globalThis.fetch = original;
  };
}

function callback(cookies: string[]): Promise<Response> {
  return SELF.fetch(
    `https://test.example.com/api/auth/instagram/callback?code=abc&state=${STATE}`,
    { headers: { cookie: cookies.join("; ") }, redirect: "manual" },
  );
}

describe("the Instagram callback", () => {
  let restore: () => void;
  let igUserId: string;

  beforeEach(async () => {
    await applySchema();
    igUserId = `1784140000000000${++seq}`;
    restore = stubOAuth(igUserId);
  });
  afterEach(() => restore());

  it("stores the account when the project id is one the server has never seen", async () => {
    const response = await callback([
      `ig_oauth_state=${STATE}`,
      `ig_oauth_project=${PROJECT_ID}`,
    ]);

    // A 500 here is the foreign key rejecting the insert — a live token thrown
    // away on the last line of a flow that otherwise worked.
    expect(response.status).toBe(302);

    const account = await env.DB.prepare(
      `SELECT project_id, handle, status FROM accounts WHERE external_id = ?`,
    )
      .bind(igUserId)
      .first<{ project_id: string; handle: string; status: string }>();

    expect(account).toBeTruthy();
    expect(account!.project_id).toBe(PROJECT_ID);
    expect(account!.status).toBe("active");

    // Created on demand rather than assumed to exist.
    const project = await env.DB.prepare(
      `SELECT id FROM projects WHERE id = ?`,
    )
      .bind(PROJECT_ID)
      .first();
    expect(project).toBeTruthy();
  });

  it("stores the account when no project is carried at all", async () => {
    const response = await callback([`ig_oauth_state=${STATE}`]);
    expect(response.status).toBe(302);

    const account = await env.DB.prepare(
      `SELECT project_id FROM accounts WHERE external_id = ?`,
    )
      .bind(igUserId)
      .first<{ project_id: string | null }>();

    expect(account).toBeTruthy();
    expect(account!.project_id).toBeNull();
  });

  it("refuses a callback whose state did not start here", async () => {
    const response = await SELF.fetch(
      `https://test.example.com/api/auth/instagram/callback?code=abc&state=forged`,
      { headers: { cookie: `ig_oauth_state=${STATE}` }, redirect: "manual" },
    );
    expect(response.status).toBe(400);

    const account = await env.DB.prepare(
      `SELECT id FROM accounts WHERE external_id = ?`,
    )
      .bind(igUserId)
      .first();
    expect(account).toBeNull();
  });
});

/* The account switch.
 *
 * Instagram's authorize screen reuses whatever session the browser holds, so
 * without `force_reauth` a second connect silently re-offers the account
 * already connected — which is indistinguishable from the button being
 * broken. These assert the parameter, because that one parameter is the whole
 * difference between "multi-account" and "one account forever".
 */
describe("the Instagram connect start", () => {
  /* The start route is behind the session gate, unlike the callback — Meta
   * redirects the browser into the callback with no cookie, but nothing
   * outside the app should be able to begin a connect. */
  const start = async (query: string) => {
    const login = await SELF.fetch("https://test.example.com/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ password: "correct-horse-battery-staple" }),
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    return SELF.fetch(
      `https://test.example.com/api/auth/instagram/start${query}`,
      { headers: { cookie }, redirect: "manual" },
    );
  };

  const authorizeUrl = async (query: string) => {
    const response = await start(query);
    return new URL(response.headers.get("location")!);
  };

  it("asks for the insights scope", async () => {
    const url = await authorizeUrl("");
    expect(url.searchParams.get("scope")).toContain(
      "instagram_business_manage_insights",
    );
  });

  it("forces a fresh login when switching accounts", async () => {
    const url = await authorizeUrl("?switch=1");
    expect(url.searchParams.get("force_reauth")).toBe("true");
  });

  /* Reconnecting an expiring token is the common case and must not demand a
   * password — that friction is the reason force_reauth is opt-in. */
  it("does not force a fresh login on a plain reconnect", async () => {
    const url = await authorizeUrl("");
    expect(url.searchParams.has("force_reauth")).toBe(false);
  });

  it("still carries the project through a switch", async () => {
    const response = await start("?switch=1&project=proj-42");
    expect(response.headers.get("set-cookie")).toContain("proj-42");
  });
});
