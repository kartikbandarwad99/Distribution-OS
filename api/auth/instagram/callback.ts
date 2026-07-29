/* Step two: trade the code for a token that lasts.
 *
 * Meta hands back a short-lived token first, which is useless for a scheduler
 * — it would expire mid-week. It is immediately exchanged for a 60-day
 * long-lived token, and only that is stored.
 *
 * The client secret is used here and only here. It is a server environment
 * variable and never reaches the browser, which is the substantive difference
 * between this and the desktop app's paste-a-token flow. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { env, instagramRedirectUri } from "../../_lib/env.js";
import { fail, readCookie, clearCookie } from "../../_lib/http.js";
import { encryptToken } from "../../_lib/crypto.js";
import { sql } from "../../_lib/db.js";

interface ShortLivedToken {
  access_token: string;
  user_id: string | number;
}

interface LongLivedToken {
  access_token: string;
  expires_in: number;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { code, state, error_description: denial } = req.query;

    if (typeof denial === "string") {
      res.redirect(302, `/settings?ig_error=${encodeURIComponent(denial)}`);
      return;
    }
    if (typeof code !== "string" || typeof state !== "string") {
      res.status(400).json({ error: "Instagram did not return an authorization code." });
      return;
    }

    const expected = readCookie(req, "ig_oauth_state");
    if (!expected || expected !== state) {
      res.status(400).json({
        error: "This sign-in did not start here. Begin again from Settings.",
      });
      return;
    }
    const projectId = readCookie(req, "ig_oauth_project") || null;

    const { appId, appSecret } = env.instagram;

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
          redirect_uri: instagramRedirectUri(),
          code,
        }).toString(),
      },
    );
    const short = (await shortResponse.json()) as ShortLivedToken & {
      error_message?: string;
    };
    if (!shortResponse.ok) {
      throw new Error(short.error_message ?? "Instagram rejected the authorization code.");
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
    const expiresAt = new Date(Date.now() + long.expires_in * 1000);

    // Reconnecting an already-linked account refreshes it in place, so the
    // recovery path for an expired token is simply to connect again.
    const db = sql();
    await db`
      insert into accounts
        (project_id, platform, external_id, handle, access_token_enc,
         expires_at, scopes, status)
      values
        (${projectId}, 'instagram', ${externalId}, ${profile.username ?? null},
         ${encryptToken(long.access_token)}, ${expiresAt.toISOString()},
         ${["instagram_business_basic", "instagram_business_content_publish"]},
         'active')
      on conflict (platform, external_id) do update set
        handle           = excluded.handle,
        access_token_enc = excluded.access_token_enc,
        expires_at       = excluded.expires_at,
        status           = 'active',
        connected_at     = now()
    `;

    res.setHeader("Set-Cookie", [
      clearCookie("ig_oauth_state"),
      clearCookie("ig_oauth_project"),
    ]);
    res.redirect(
      302,
      `/settings?connected=${encodeURIComponent(profile.username ?? externalId)}`,
    );
  } catch (error) {
    fail(res, error);
  }
}
