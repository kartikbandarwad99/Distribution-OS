/* Step one of the Instagram connect flow.
 *
 * The desktop app could never do this: Meta rejects loopback redirect URIs and
 * demands a public HTTPS callback, which is precisely what deploying buys us.
 * The paste-a-token workaround in src/lib/connect.ts exists only because this
 * route did not. */

import type { VercelRequest, VercelResponse } from "@vercel/node";
import { randomBytes } from "node:crypto";
import { env, instagramRedirectUri } from "../../_lib/env.js";
import { fail } from "../../_lib/http.js";

const SCOPES = ["instagram_business_basic", "instagram_business_content_publish"];

export default function handler(req: VercelRequest, res: VercelResponse) {
  try {
    // Round-trips through the platform and is checked on the way back, so a
    // stray callback cannot mint an account. Held in a short-lived cookie
    // rather than a table — there is nothing here worth persisting.
    const state = randomBytes(16).toString("base64url");

    const url = new URL("https://www.instagram.com/oauth/authorize");
    url.searchParams.set("client_id", env.instagram.appId);
    url.searchParams.set("redirect_uri", instagramRedirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", SCOPES.join(","));
    url.searchParams.set("state", state);

    // `project` survives the round trip so the account lands in the right
    // project without a second step once multi-project fan-out exists.
    const project = typeof req.query.project === "string" ? req.query.project : "";

    res.setHeader("Set-Cookie", [
      `ig_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
      `ig_oauth_project=${encodeURIComponent(project)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`,
    ]);
    res.redirect(302, url.toString());
  } catch (error) {
    fail(res, error);
  }
}
