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
