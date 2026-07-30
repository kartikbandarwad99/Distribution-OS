import { defineConfig } from "vitest/config";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";

/* Tests run inside the Workers runtime, against real D1, R2 and Durable Object
 * implementations rather than mocks of them. That matters most for the
 * scheduler: `runDurableObjectAlarm()` fires a scheduled alarm immediately, so
 * a state machine whose steps are half an hour apart is testable in
 * milliseconds without any of the timing being faked away.
 *
 * The secrets here are test values. They are the same *shape* as the real ones
 * — TOKEN_ENC_KEY must still decode to exactly 32 bytes — so the config checks
 * are exercised rather than bypassed. */
export default defineConfig({
  test: {
    // Each test file gets its own Workers runtime, and starting one takes
    // tens of seconds on a cold cache. Three at once overruns the pool's
    // startup timeout and every file fails before a single test runs, which
    // looks like a broken suite rather than a slow one.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          APP_URL: "https://test.example.com",
          APP_PASSWORD: "correct-horse-battery-staple",
          TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
          INSTAGRAM_APP_ID: "test-app-id",
          INSTAGRAM_APP_SECRET: "test-app-secret",
        },
      },
    }),
  ],
});
