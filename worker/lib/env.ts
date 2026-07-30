/* Environment access that fails loudly and early.
 *
 * On Vercel this read `process.env` at module scope. A Worker has no ambient
 * environment — bindings and secrets arrive as the `env` argument of each
 * invocation — so the same design is expressed as a function of `env` rather
 * than a module singleton. The property that mattered is kept: nothing is
 * validated at import time, and each getter throws its own readable message at
 * the moment the value is actually needed, so an Instagram connect attempt does
 * not fall over because the encryption key is unset. */

export class ConfigError extends Error {}

/** Bindings and vars, as declared in wrangler.jsonc. */
export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  /** Typed so RPC calls on a stub are checked. The import is type-only, so
   *  the cycle between this and worker/scheduler.ts costs nothing at runtime. */
  ACCOUNT_SCHEDULER: DurableObjectNamespace<
    import("../scheduler.js").AccountScheduler
  >;
  /** Present only when the Worker is deployed alongside the SPA build. */
  ASSETS?: Fetcher;

  APP_URL?: string;
  INSTAGRAM_APP_ID?: string;
  INSTAGRAM_APP_SECRET?: string;
  /** base64, must decode to exactly 32 bytes. */
  TOKEN_ENC_KEY?: string;
  /** The shared password behind the whole app. See worker/lib/auth.ts. */
  APP_PASSWORD?: string;
}

function required(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== "string" || value === "") {
    throw new ConfigError(
      `${name} is not set. Add it with: wrangler secret put ${name} (or as a var in wrangler.jsonc for APP_URL).`,
    );
  }
  return value;
}

export function config(env: Env) {
  return {
    /** Deployed origin, no trailing slash. */
    get appUrl(): string {
      return required(env, "APP_URL").replace(/\/+$/, "");
    },

    get instagram() {
      return {
        appId: required(env, "INSTAGRAM_APP_ID"),
        appSecret: required(env, "INSTAGRAM_APP_SECRET"),
      };
    },

    get tokenEncKey(): Uint8Array {
      const key = new Uint8Array(
        Buffer.from(required(env, "TOKEN_ENC_KEY"), "base64"),
      );
      if (key.length !== 32) {
        throw new ConfigError(
          `TOKEN_ENC_KEY must decode to exactly 32 bytes, got ${key.length}. Generate one with: openssl rand -base64 32`,
        );
      }
      return key;
    },

    get appPassword(): string {
      return required(env, "APP_PASSWORD");
    },
  };
}

/** The redirect URI registered with Meta. Derived so it can never drift. */
export const instagramRedirectUri = (env: Env) =>
  `${config(env).appUrl}/api/auth/instagram/callback`;
