/* The gate.
 *
 * Before this existed the API was completely open: anyone who found
 * /api/auth/instagram/start could run the OAuth flow and write into `accounts`,
 * and /api/publish accepted anonymous POSTs. A live sixty-day Meta token must
 * not land in the database before there is a door.
 *
 * This is a single-user tool, so the door is a shared password traded for a
 * signed HttpOnly session cookie — deliberately not user accounts, sessions
 * tables, or anything resembling multi-tenant auth. One helper,
 * `requireSession`, is called by every route that is not the login route
 * itself. */

import { config, type Env } from "./env.js";
import { json, readCookie, setCookie, clearCookie } from "./http.js";
import { mintToken, readToken, safeEqual } from "./signing.js";

export const SESSION_COOKIE = "dos_session";

/** Long enough that the tool does not nag, short enough that a stolen laptop
 *  cookie is not permanent. */
const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;

/** Thrown rather than returned so a route body can be a straight line and the
 *  router turns this into a 401. */
export class Unauthorized extends Error {
  constructor() {
    super("Sign in first.");
  }
}

export function hasSession(request: Request, env: Env): boolean {
  const cookie = readCookie(request, SESSION_COOKIE);
  if (!cookie) return false;
  return readToken(config(env).appPassword, cookie) === "session";
}

export function requireSession(request: Request, env: Env): void {
  if (!hasSession(request, env)) throw new Unauthorized();
}

/** POST /api/auth/login — { password } in, session cookie out. */
export async function login(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as {
    password?: string;
  };
  const expected = config(env).appPassword;

  if (typeof body.password !== "string" || !safeEqual(body.password, expected)) {
    // No distinction between "no password sent" and "wrong password".
    return json({ error: "Wrong password." }, 401);
  }

  return json(
    { ok: true },
    200,
    {
      "set-cookie": setCookie(
        SESSION_COOKIE,
        mintToken(expected, "session", SESSION_TTL_SECONDS),
        SESSION_TTL_SECONDS,
      ),
    },
  );
}

export const logout = (): Response =>
  json({ ok: true }, 200, { "set-cookie": clearCookie(SESSION_COOKIE) });

/** Lets the SPA decide whether to show the password screen without guessing
 *  from a 401 on some unrelated call. */
export const session = (request: Request, env: Env): Response =>
  json({ authenticated: hasSession(request, env) });
