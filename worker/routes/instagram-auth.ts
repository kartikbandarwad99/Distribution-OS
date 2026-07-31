/* The Instagram connect flow, ported from api/auth/instagram/*.
 *
 * The desktop app could never do this: Meta rejects loopback redirect URIs and
 * demands a public HTTPS callback, which is precisely what deploying buys us.
 * The paste-a-token workaround in src/lib/connect.ts exists only because these
 * routes did not.
 *
 * Both routes are behind the session gate. Before that gate existed, anyone who
 * found /api/auth/instagram/start could run the flow and write a live sixty-day
 * token into `accounts`. */

import { randomBytes } from "node:crypto";
import { config, instagramRedirectUri, type Env } from "../lib/env.js";
import { encryptToken } from "../lib/crypto.js";
import { json, redirect, readCookie, clearCookie } from "../lib/http.js";
import { nowISO, run } from "../lib/db.js";

/* Scopes are baked into the token at issue and cannot be widened afterwards,
 * so adding one here means every already-connected account must run the flow
 * again. Settings detects that from `accounts.scopes` and asks for it, rather
 * than letting the insights fetch fail with an opaque permission error. */
const SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
  // Reading reach/views/saves/shares back off published media.
  "instagram_business_manage_insights",
];

/** The one scope that is not needed to publish. Named here because Settings
 *  and the metrics route both have to ask whether an account carries it. */
export const INSIGHTS_SCOPE = "instagram_business_manage_insights";

interface ShortLivedToken {
  access_token: string;
  user_id: string | number;
}

interface LongLivedToken {
  access_token: string;
  expires_in: number;
}

export function start(request: Request, env: Env): Response {
  // Round-trips through the platform and is checked on the way back, so a
  // stray callback cannot mint an account. Held in a short-lived cookie rather
  // than a table — there is nothing here worth persisting.
  const state = randomBytes(16).toString("base64url");

  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config(env).instagram.appId);
  url.searchParams.set("redirect_uri", instagramRedirectUri(env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", SCOPES.join(","));
  url.searchParams.set("state", state);

  const incoming = new URL(request.url).searchParams;

  /* Without this, Instagram reuses whatever session the browser already holds
   * and shows "continue sharing to <app>?" for the account already connected —
   * which makes "Connect another account" look broken, because it silently
   * reconnects the same one. `force_reauth` forces the login screen so a
   * different account can be chosen.
   *
   * Only set when asked. Reconnecting an expiring token is the common case and
   * should not demand a password. */
  if (incoming.get("switch") === "1") {
    url.searchParams.set("force_reauth", "true");
  }

  // `project` survives the round trip so the account lands in the right
  // project without a second step once multi-project fan-out exists.
  const project = incoming.get("project") ?? "";

  const response = redirect(url.toString());
  response.headers.append(
    "set-cookie",
    `ig_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  );
  response.headers.append(
    "set-cookie",
    `ig_oauth_project=${encodeURIComponent(project)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
  );
  return response;
}

/** Meta's denial text is accurate and useless. The one case worth translating
 *  is the commonest reason a connect fails: a personal account. Instagram
 *  Login will not issue `instagram_business_*` scopes to one, and the raw
 *  message never says so — it reads like a bug in the app. */
function explain(denial: string): string {
  const personal = /not.*(business|professional)|professional account/i.test(
    denial,
  );
  return personal
    ? "Instagram only allows posting and analytics from a Professional account. Open Instagram → Settings → Account type and switch to Creator or Business (it is free, instant, and reversible), then connect again."
    : denial;
}

/** Step two: trade the code for a token that lasts.
 *
 *  Meta hands back a short-lived token first, which is useless for a scheduler
 *  — it would expire mid-week. It is immediately exchanged for a 60-day
 *  long-lived token, and only that is stored.
 *
 *  The client secret is used here and only here. It is a Worker secret and
 *  never reaches the browser, which is the substantive difference between this
 *  and the desktop app's paste-a-token flow. */
export async function callback(request: Request, env: Env): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const denial = params.get("error_description");
  if (denial) {
    return redirect(`/settings?ig_error=${encodeURIComponent(explain(denial))}`);
  }

  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) {
    return json(
      { error: "Instagram did not return an authorization code." },
      400,
    );
  }

  const expected = readCookie(request, "ig_oauth_state");
  if (!expected || expected !== state) {
    return json(
      { error: "This sign-in did not start here. Begin again from Settings." },
      400,
    );
  }
  const projectId = readCookie(request, "ig_oauth_project") || null;

  const { appId, appSecret } = config(env).instagram;

  // 1. Code → short-lived token. Form-encoded, per Meta.
  const shortResponse = await fetch(
    "https://api.instagram.com/oauth/access_token",
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: "authorization_code",
        redirect_uri: instagramRedirectUri(env),
        code,
      }).toString(),
    },
  );
  const short = (await shortResponse.json()) as ShortLivedToken & {
    error_message?: string;
  };
  if (!shortResponse.ok) {
    throw new Error(
      short.error_message ?? "Instagram rejected the authorization code.",
    );
  }

  // 2. Short-lived → 60-day. Anything less cannot survive a schedule.
  const longUrl = new URL("https://graph.instagram.com/access_token");
  longUrl.searchParams.set("grant_type", "ig_exchange_token");
  longUrl.searchParams.set("client_secret", appSecret);
  longUrl.searchParams.set("access_token", short.access_token);

  const longResponse = await fetch(longUrl);
  const long = (await longResponse.json()) as LongLivedToken & {
    error?: { message?: string };
  };
  if (!longResponse.ok) {
    throw new Error(
      long.error?.message ?? "Could not exchange for a long-lived token.",
    );
  }

  // 3. Resolve the account. `user_id` here is the {ig-user-id} every
  //    publishing call needs, so it is stored rather than re-fetched.
  const profileUrl = new URL("https://graph.instagram.com/v23.0/me");
  profileUrl.searchParams.set("fields", "user_id,username");
  profileUrl.searchParams.set("access_token", long.access_token);
  const profile = (await (await fetch(profileUrl)).json()) as {
    user_id?: string;
    username?: string;
  };

  const externalId = String(profile.user_id ?? short.user_id);
  const expiresAt = new Date(Date.now() + long.expires_in * 1000).toISOString();

  // Same on-demand project row as posts.upsert, and for the same reason: the
  // frontend invents project ids locally, so `accounts.project_id` names a row
  // the server has never seen and the foreign key rejects the insert. Without
  // this the whole OAuth round trip succeeds and then throws away a live
  // sixty-day token on the last statement.
  if (projectId) {
    await run(
      env,
      `INSERT INTO projects (id, name, created_at) VALUES (?, ?, ?)
       ON CONFLICT (id) DO NOTHING`,
      projectId,
      projectId,
      nowISO(),
    );
  }

  // Reconnecting an already-linked account refreshes it in place, so the
  // recovery path for an expired token is simply to connect again.
  await env.DB.prepare(
    `INSERT INTO accounts
       (id, project_id, platform, external_id, handle, access_token_enc,
        expires_at, scopes, status, connected_at)
     VALUES (?, ?, 'instagram', ?, ?, ?, ?, ?, 'active', ?)
     ON CONFLICT (platform, external_id) DO UPDATE SET
       handle           = excluded.handle,
       access_token_enc = excluded.access_token_enc,
       expires_at       = excluded.expires_at,
       status           = 'active',
       connected_at     = excluded.connected_at`,
  )
    .bind(
      crypto.randomUUID(),
      projectId,
      externalId,
      profile.username ?? null,
      encryptToken(long.access_token, config(env).tokenEncKey),
      expiresAt,
      JSON.stringify(SCOPES),
      nowISO(),
    )
    .run();

  const response = redirect(
    `/settings?connected=${encodeURIComponent(profile.username ?? externalId)}`,
  );
  response.headers.append("set-cookie", clearCookie("ig_oauth_state"));
  response.headers.append("set-cookie", clearCookie("ig_oauth_project"));
  return response;
}
