/* ═══════════════════════════════════════════════════════════════════════════
   CONNECTING A CHANNEL
   ═══════════════════════════════════════════════════════════════════════════

   There are two ways in, because the platforms do not agree on what a desktop
   app is allowed to do.

   X and LinkedIn accept a loopback redirect: the Rust side opens a short-lived
   listener on 127.0.0.1, sends you to the platform in your real browser, and
   catches the redirect when you approve. The authorization code is exchanged
   for tokens in Rust, so the client secret never enters the webview and never
   lands in localStorage.

   Meta (Instagram, Threads) refuses loopback redirect URIs outright — it wants
   a public HTTPS URL, which a local-first app has no business owning. Their
   console will hand you a token directly, so for those platforms you paste one
   and we trade it up to a long-lived token. Same destination, one more paste.

   What each platform needs from you before any of this works is described in
   PLATFORM_SETUP below, and shown in the UI — there is no way around
   registering an app, because the token is issued to an app, not to a person.
   ═══════════════════════════════════════════════════════════════════════════ */

import { invoke } from "@tauri-apps/api/core";
import type { AppCredentials, Platform } from "./model";

export const isTauri =
  typeof window !== "undefined" &&
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ !==
    undefined;

export interface OAuthResult {
  accessToken: string;
  refreshToken: string | null;
  /** Seconds from now, or null when the token does not expire. */
  expiresIn: number | null;
  scopes: string[];
  externalId: string | null;
  handle: string | null;
}

/**
 * Some platforms refuse a loopback redirect URI, which makes the flow above
 * impossible for a desktop app without hosting a public HTTPS page to bounce
 * through. Where their console will simply hand you a token instead, we take
 * that door — one paste, and everything downstream is identical.
 */
export interface ManualToken {
  /** Why the browser flow is not on offer. Shown, not hidden. */
  why: string;
  /** Where in the console the token is generated. */
  where: string;
}

export interface PlatformSetup {
  label: string;
  /** Where you register the app. */
  console: string;
  scopes: string[];
  /** The redirect URI to register, or null where the platform rejects loopback. */
  redirect: string | null;
  steps: string[];
  /** Set where a pasted token replaces the redirect flow entirely. */
  manualToken: ManualToken | null;
  /** Honest statement of what will not work yet, and why. */
  caveat: string | null;
  /** False where we cannot publish for you at all yet. */
  canPublish: boolean;
}

/* The loopback port is fixed so the redirect URI you register stays valid. */
export const REDIRECT_PORT = 8765;
export const redirectUri = (platform: Platform) =>
  `http://127.0.0.1:${REDIRECT_PORT}/callback/${platform}`;

export const PLATFORM_SETUP: Partial<Record<Platform, PlatformSetup>> = {
  x: {
    label: "X",
    console: "https://developer.x.com/en/portal/dashboard",
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    redirect: redirectUri("x"),
    manualToken: null,
    canPublish: true,
    steps: [
      "Sign in at the X developer portal and create a Project, then an App inside it.",
      "In the App's User authentication settings, turn on OAuth 2.0 and choose “Native App” — this makes it a public client and uses PKCE, so no client secret is needed.",
      "Set App permissions to “Read and write”.",
      "Add the callback URL below exactly as shown, plus any website URL for the required field.",
      "Copy the OAuth 2.0 Client ID into the field below. Leave the secret blank for a native app.",
    ],
    caveat:
      "The free tier allows roughly 500 posts a month and text-only posting. Attaching images needs a paid tier, because media upload is not on the free plan.",
  },
  instagram: {
    label: "Instagram",
    console: "https://developers.facebook.com/apps",
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
    ],
    redirect: null,
    manualToken: {
      why: "Meta rejects loopback redirect URIs for Instagram, so the browser flow cannot finish on a desktop app without a public HTTPS page to bounce through. Their console will just give you the token instead, which is the same thing that flow would have produced.",
      where: "Instagram → API setup with Instagram login → Generate access tokens.",
    },
    canPublish: false,
    steps: [
      "Your Instagram account must be a Business or Creator account — convert it in the Instagram app under Settings → Account type.",
      "At developers.facebook.com create an app of type “Business”, then add the “Instagram” product with Instagram API setup with Instagram login.",
      "Add yourself as an Instagram Tester and accept the invite from your Instagram account's settings, so the app works in Development mode without review. Development mode is enough — App Review is only for other people's accounts.",
      "Copy the Instagram App ID and App Secret into the fields below.",
      "Under “Generate access tokens”, add your account and copy the token it produces into the box below. Leave the redirect URI and webhook fields in Meta's console empty — neither is used.",
    ],
    caveat:
      "Development mode is enough to post to your own account — App Review is only needed for other people's. The real blocker is media: Meta's publishing endpoint fetches your image from a public HTTPS URL rather than accepting an upload, and a local-first app has no such URL. So scheduled Instagram posts fire a reminder with the caption copied and the media revealed in Finder until an upload destination exists.",
  },
  threads: {
    label: "Threads",
    console: "https://developers.facebook.com/apps",
    scopes: ["threads_basic", "threads_content_publish"],
    redirect: null,
    manualToken: {
      why: "Threads is a Meta product and refuses loopback redirect URIs for the same reason Instagram does.",
      where: "Threads API → Use cases → generate a token for your account.",
    },
    canPublish: false,
    steps: [
      "Create an app at developers.facebook.com and add the “Threads API” product.",
      "Add yourself as a Threads Tester and accept the invite.",
      "Copy the Threads App ID and App Secret below.",
      "Generate an access token for your account and paste it into the box below.",
    ],
    caveat:
      "Same media constraint as Instagram: images are fetched from a public URL rather than uploaded.",
  },
  linkedin: {
    label: "LinkedIn",
    console: "https://www.linkedin.com/developers/apps",
    scopes: ["w_member_social", "profile", "openid"],
    redirect: redirectUri("linkedin"),
    manualToken: null,
    canPublish: true,
    steps: [
      "Create an app at the LinkedIn developer portal, associated with a Company Page you administer.",
      "Request the “Share on LinkedIn” and “Sign In with LinkedIn using OpenID Connect” products.",
      "Add the callback URL below under Auth → Redirect URLs.",
      "Copy the Client ID and Client Secret below.",
    ],
    caveat: null,
  },
};

/** Platforms we can actually run an OAuth flow for today. */
export const CONNECTABLE = Object.keys(PLATFORM_SETUP) as Platform[];

export class ConnectError extends Error {}

/**
 * Runs the whole flow and resolves once the platform has redirected back.
 * Rejects with a readable message if the user cancels or the app is
 * misconfigured — never with a raw platform error body.
 */
export async function connect(
  platform: Platform,
  credentials: AppCredentials,
): Promise<OAuthResult> {
  const setup = PLATFORM_SETUP[platform];
  if (!setup) {
    throw new ConnectError(`No connection flow for ${platform} yet.`);
  }
  if (!credentials.clientId.trim()) {
    throw new ConnectError(
      `Add your ${setup.label} client ID first — the token is issued to an app, not to an account.`,
    );
  }
  if (!setup.redirect) {
    throw new ConnectError(
      `${setup.label} does not allow a loopback redirect — paste a token from its console instead.`,
    );
  }
  if (!isTauri) {
    throw new ConnectError(
      "Connecting needs the desktop app. The browser preview has no loopback listener to catch the redirect.",
    );
  }

  return invoke<OAuthResult>("oauth_connect", {
    platform,
    clientId: credentials.clientId.trim(),
    clientSecret: credentials.clientSecret.trim() || null,
    scopes: setup.scopes,
    redirectUri: setup.redirect,
  });
}

/**
 * Takes a token copied out of the platform's console and turns it into the same
 * result the redirect flow would have produced — traded up to a long-lived
 * token, and with the account it belongs to looked up so the channel gets a
 * real handle rather than a placeholder.
 */
export async function adoptToken(
  platform: Platform,
  token: string,
  credentials: AppCredentials,
): Promise<OAuthResult> {
  const setup = PLATFORM_SETUP[platform];
  if (!setup?.manualToken) {
    throw new ConnectError(`${platform} has no pasteable token.`);
  }
  if (!token.trim()) {
    throw new ConnectError("Paste the access token first.");
  }
  if (!credentials.clientSecret.trim()) {
    throw new ConnectError(
      "Add your app secret above first — it is what makes a pasted token last 60 days instead of an hour.",
    );
  }
  if (!isTauri) {
    throw new ConnectError("Connecting needs the desktop app.");
  }

  return invoke<OAuthResult>("oauth_adopt_token", {
    platform,
    accessToken: token.trim(),
    clientSecret: credentials.clientSecret.trim(),
    scopes: setup.scopes,
  });
}

/** Extends a long-lived Meta token by another full term. */
export async function refreshToken(
  platform: Platform,
  token: string,
): Promise<OAuthResult> {
  return invoke<OAuthResult>("oauth_refresh_token", {
    platform,
    accessToken: token,
  });
}

/** Tokens inside this window of expiry get renewed on launch. */
const RENEW_WITHIN_DAYS = 10;

export function needsRenewal(expiresAt: string | null): boolean {
  if (!expiresAt) return false;
  const due = new Date(expiresAt).getTime();
  if (Number.isNaN(due)) return false;
  return due - Date.now() < RENEW_WITHIN_DAYS * 24 * 60 * 60 * 1000;
}

/** Local stamp for when a token dies, so the UI can warn before it does. */
export function expiryStamp(expiresIn: number | null): string | null {
  if (!expiresIn) return null;
  const when = new Date(Date.now() + expiresIn * 1000);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${when.getFullYear()}-${p2(when.getMonth() + 1)}-${p2(when.getDate())}T${p2(
    when.getHours(),
  )}:${p2(when.getMinutes())}:00`;
}
