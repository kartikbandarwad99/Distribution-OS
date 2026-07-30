import { SELF } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { applySchema } from "./helpers.js";

/* The gate. Before this existed, /api/auth/instagram/start would run the OAuth
 * flow for anyone who found it and write a live sixty-day token into the
 * database, and /api/publish accepted anonymous POSTs. */

const PASSWORD = "correct-horse-battery-staple";

async function signIn(): Promise<string> {
  const response = await SELF.fetch("https://test.example.com/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ password: PASSWORD }),
  });
  expect(response.status).toBe(200);
  const cookie = response.headers.get("set-cookie");
  expect(cookie).toBeTruthy();
  return cookie!.split(";")[0];
}

describe("the password gate", () => {
  beforeEach(applySchema);

  it("rejects the wrong password", async () => {
    const response = await SELF.fetch(
      "https://test.example.com/api/auth/login",
      { method: "POST", body: JSON.stringify({ password: "hunter2" }) },
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("rejects a request with no password at all", async () => {
    const response = await SELF.fetch(
      "https://test.example.com/api/auth/login",
      { method: "POST", body: "{}" },
    );
    expect(response.status).toBe(401);
  });

  it("issues an HttpOnly session cookie for the right password", async () => {
    const response = await SELF.fetch(
      "https://test.example.com/api/auth/login",
      { method: "POST", body: JSON.stringify({ password: PASSWORD }) },
    );
    const cookie = response.headers.get("set-cookie")!;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
  });

  it.each([
    ["GET", "/api/accounts"],
    ["GET", "/api/auth/instagram/start"],
    ["POST", "/api/publish"],
    ["POST", "/api/schedule"],
    ["POST", "/api/cancel"],
    ["POST", "/api/media/upload-url"],
  ])("refuses %s %s without a session", async (method, path) => {
    const response = await SELF.fetch(`https://test.example.com${path}`, {
      method,
      body: method === "POST" ? "{}" : undefined,
    });
    expect(response.status).toBe(401);
  });

  it("lets a signed-in request through", async () => {
    const cookie = await signIn();
    const response = await SELF.fetch("https://test.example.com/api/accounts", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ accounts: [] });
  });

  it("rejects a forged session cookie", async () => {
    const response = await SELF.fetch("https://test.example.com/api/accounts", {
      headers: { cookie: "dos_session=session.99999999999.deadbeef" },
    });
    expect(response.status).toBe(401);
  });

  it("reports session state so the SPA need not guess from a 401", async () => {
    const anonymous = await SELF.fetch(
      "https://test.example.com/api/auth/session",
    );
    expect(await anonymous.json()).toEqual({ authenticated: false });

    const cookie = await signIn();
    const signedIn = await SELF.fetch(
      "https://test.example.com/api/auth/session",
      { headers: { cookie } },
    );
    expect(await signedIn.json()).toEqual({ authenticated: true });
  });

  it("never returns the encrypted token from /api/accounts", async () => {
    const cookie = await signIn();
    await env_insertAccount();
    const response = await SELF.fetch("https://test.example.com/api/accounts", {
      headers: { cookie },
    });
    const text = await response.text();
    expect(text).toContain("testhandle");
    expect(text).not.toContain("access_token_enc");
    expect(text).not.toContain("SUPER-SECRET-CIPHERTEXT");
  });
});

async function env_insertAccount() {
  const { env } = await import("cloudflare:test");
  await env.DB.prepare(
    `INSERT INTO accounts (id, platform, external_id, handle, access_token_enc,
                           scopes, status, connected_at)
     VALUES ('a1','instagram','1','testhandle','SUPER-SECRET-CIPHERTEXT','[]','active',?)`,
  )
    .bind(new Date().toISOString())
    .run();
}
