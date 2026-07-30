/** Vite's `?raw` suffix, used to inline db/schema.sql into the test bundle. */
declare module "*.sql?raw" {
  const contents: string;
  export default contents;
}

/** What `env` from `cloudflare:test` is. Pointing it at the Worker's own Env
 *  means a binding the tests use but wrangler.jsonc does not declare is a
 *  type error rather than a runtime surprise. */
declare namespace Cloudflare {
  interface Env {
    DB: D1Database;
    MEDIA: R2Bucket;
    ACCOUNT_SCHEDULER: DurableObjectNamespace<
      import("../worker/scheduler.js").AccountScheduler
    >;
    APP_URL?: string;
    INSTAGRAM_APP_ID?: string;
    INSTAGRAM_APP_SECRET?: string;
    TOKEN_ENC_KEY?: string;
    APP_PASSWORD?: string;
  }
}
