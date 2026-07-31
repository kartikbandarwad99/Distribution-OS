/* The whole backend: one Worker and one Durable Object class.
 *
 * Static assets (the Vite SPA) are served by the platform ahead of this script
 * for everything except `/api/*`, which `run_worker_first` in wrangler.jsonc
 * routes here. Same origin as the API, so there is no CORS to configure.
 *
 * Replaces four Vercel handlers. The mechanical part of the port is that a
 * handler now returns a `Response` instead of mutating a `res`, and reads
 * configuration from `env` instead of `process.env`. */

import { type Env, ConfigError } from "./lib/env.js";
import { fail, json } from "./lib/http.js";
import { Unauthorized, login, logout, requireSession, session } from "./lib/auth.js";
import * as instagramAuth from "./routes/instagram-auth.js";
import * as media from "./routes/media.js";
import * as publish from "./routes/publish.js";
import * as accounts from "./routes/accounts.js";
import * as posts from "./routes/posts.js";
import * as metrics from "./routes/metrics.js";
import { schedulerFor } from "./routes/publish.js";
import { IN_FLIGHT_STATES, isoFromNow } from "./lib/db.js";

export { AccountScheduler } from "./scheduler.js";

/** A route is `METHOD /path`, matched exactly — there are no path parameters,
 *  so a route that addresses one row takes its id from the query string. A
 *  router library would be more code than the routes. */
type Handler = (request: Request, env: Env) => Response | Promise<Response>;

/** Open to the world by necessity, and each one says why. */
const PUBLIC_ROUTES = new Set([
  // The password gate itself.
  "POST /api/auth/login",
  "POST /api/auth/logout",
  "GET /api/auth/session",
  // Meta redirects the browser here; the cookie survives the round trip, but
  // the state parameter is the check that matters.
  "GET /api/auth/instagram/callback",
  // Meta's media fetcher has no cookie. Its signed, hour-long token is its
  // whole authority, and names exactly one object.
  "GET /api/media/fetch",
]);

const ROUTES: Record<string, Handler> = {
  "POST /api/auth/login": login,
  "POST /api/auth/logout": () => logout(),
  "GET /api/auth/session": session,

  "GET /api/auth/instagram/start": instagramAuth.start,
  "GET /api/auth/instagram/callback": instagramAuth.callback,

  "GET /api/accounts": accounts.list,
  "DELETE /api/accounts": accounts.remove,

  "PUT /api/posts": posts.upsert,
  "GET /api/targets": posts.listTargets,

  "POST /api/media/upload-url": media.uploadUrl,
  "PUT /api/media/upload": media.upload,
  "GET /api/media/fetch": media.fetchMedia,

  "GET /api/metrics": metrics.list,
  "POST /api/metrics/refresh": metrics.refresh,

  "POST /api/publish": publish.publishNow,
  "POST /api/schedule": publish.schedule,
  "POST /api/cancel": publish.cancel,
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (!url.pathname.startsWith("/api/")) {
      // Only reachable if run_worker_first is widened; the platform normally
      // serves assets without invoking this script at all.
      return env.ASSETS
        ? env.ASSETS.fetch(request)
        : new Response("Not found", { status: 404 });
    }

    const route = `${request.method} ${url.pathname}`;
    const handler = ROUTES[route];
    if (!handler) return json({ error: `No route for ${route}.` }, 404);

    try {
      if (!PUBLIC_ROUTES.has(route)) requireSession(request, env);
      return await handler(request, env);
    } catch (error) {
      if (error instanceof Unauthorized) {
        return json({ error: error.message }, 401);
      }
      return fail(error);
    }
  },

  /* The safety net, and the only cron. Not enabled yet — the trigger is added
   * in step 10 of HANDOFF.md, after the alarm path has been proven — but the
   * handler ships with the port so turning it on is a config change rather
   * than new code.
   *
   * It does exactly one thing: find targets that D1 believes are in flight but
   * whose time has passed, and poke their account's object to re-arm. That
   * catches what alarms cannot catch themselves — an object deleted, a deploy
   * that dropped an alarm, a bug that exited without re-arming.
   *
   * It must never publish. If it starts doing the publishing, the polling
   * design this replaced has been rebuilt by accident.
   *
   * The query is indexed by post_targets_due_idx, whose WHERE clause lists
   * exactly IN_FLIGHT_STATES. That is a free-tier requirement rather than an
   * optimisation: D1 bills rows read and an unindexed scan counts every row it
   * touches. */
  async scheduled(
    _event: ScheduledController,
    env: Env,
    _ctx: ExecutionContext,
  ): Promise<void> {
    try {
      const placeholders = IN_FLIGHT_STATES.map(() => "?").join(",");
      const stuck = await env.DB.prepare(
        `SELECT id, account_id FROM post_targets
          WHERE state IN (${placeholders})
            AND scheduled_at <= ?
          LIMIT 20`,
      )
        .bind(...IN_FLIGHT_STATES, isoFromNow(-5 * 60 * 1000))
        .all<{ id: string; account_id: string }>();

      const accountIds = new Set(
        (stuck.results ?? []).map((row) => row.account_id),
      );
      for (const accountId of accountIds) {
        await schedulerFor(env, accountId).poke(accountId);
      }

      /* Metrics refresh rides the same cron rather than getting one of its
       * own. It runs after the re-arm, and last, because it is the part that
       * may spend the whole external-subrequest budget — publishing recovery
       * must not be starved by a chart being out of date.
       *
       * Its own failures are swallowed here for the same reason: Instagram
       * being unreachable is a normal condition and must not abort the sweep. */
      await metrics.refreshDue(env).catch((error: unknown) => {
        console.error("metrics refresh failed", error);
      });
    } catch (error) {
      // A misconfigured environment must not turn into a cron that fails
      // silently forever with no clue in the log.
      if (error instanceof ConfigError) console.error(error.message);
      else throw error;
    }
  },
} satisfies ExportedHandler<Env>;
