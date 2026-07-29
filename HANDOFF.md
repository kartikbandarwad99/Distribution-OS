# Handoff — wire the web app to the OAuth backend

Written 2026-07-29. Self-contained: everything needed to act is here.

---

## Where things stand

`~/Projects/mysocial` is one repo serving two apps:

- **Tauri desktop app** — `src-tauri/` + `src/`. Works, stays as reference. Do not delete it.
- **Hosted web app** — the same `src/` frontend deployed to Vercel as a Vite SPA,
  plus a serverless API in `api/`. Live at **https://distributionoss.vercel.app**.

Branch `feat/web-foundation` (PR #1, open, **do not merge**) added a complete
Instagram backend:

| File | What it does |
|---|---|
| `api/auth/instagram/start.ts` | Redirects to Meta with state in an HttpOnly cookie |
| `api/auth/instagram/callback.ts` | Code → 60-day token → encrypted row in `accounts` |
| `api/_lib/instagram.ts` | container → poll `FINISHED` → `media_publish`; carousel + reels |
| `api/_lib/r2.ts` | Presigned PUT (upload) and presigned GET (Meta fetch, 1h TTL) |
| `api/_lib/crypto.ts` | AES-256-GCM for tokens. Tested: round-trips, rejects tampering |
| `api/publish.ts` | Publishes one `post_target`; conditional-UPDATE lock, retry on failure |
| `db/schema.sql` | `projects, accounts, posts, post_targets, media` |

**None of it has ever run against a live account.** No database, no R2 bucket,
no env vars set.

## Architecture decisions already made — do not relitigate

- **Vite, not Next.js.** Vercel runs a Vite SPA with an `api/` directory natively.
  The frontend was never the missing piece; porting ~30 iterated React files
  would have cost a lot and bought nothing. No SSR/RSC is needed.
- **R2 is a publish queue, not a warehouse.** Bucket stays private. Browser
  uploads via presigned PUT; Meta fetches via presigned GET that expires. Meta
  copies bytes to its own CDN in seconds. R2 egress is free.
  `deleteObject()` exists but is uncalled — retention is a later scheduling
  decision, not a rewrite.
- **One publish endpoint.** "Publish now" and a future cron tick share one path,
  so the manually-proven path is the one that runs on a timer.
- **Instagram only** for now. X (~500 posts/month free cap, pay-per-use since
  Feb 2026) and Threads come later.
- **No Meta App Review needed.** All accounts are the user's own, added as
  Instagram Testers on the app in Development mode. Accounts must be
  Business or Creator.

## Meta console state (done)

- OAuth redirect URI registered:
  `https://distributionoss.vercel.app/api/auth/instagram/callback`
- Webhooks deliberately **not** configured — this app only publishes outbound.
- App is in Development mode with the user as Instagram Tester.

---

## The work

### 1. Security gate — do this first

The deployed API is completely open. Anyone who finds
`/api/auth/instagram/start` can run the OAuth flow and write into `accounts`;
`/api/publish` and `/api/media/upload-url` accept anonymous POSTs. Before any
real token reaches the database there must be a gate.

Single-user tool, so keep it small. A shared password → signed HttpOnly session
cookie, checked in a helper that every route calls, is enough. Do not build
multi-tenant auth.

### 2. Replace the paste-a-token flow with real OAuth

`src/features/settings/SettingsView.tsx` (868 lines) currently asks for a client
ID/secret and a pasted token, driven by `src/lib/connect.ts` and Tauri `invoke`.
That existed only because Meta rejects loopback redirects and the desktop app
had no public HTTPS callback. **It now has one.**

- On web, "Connect Instagram" becomes a link to `/api/auth/instagram/start`.
- The callback redirects to `/settings?connected=<handle>` — handle that and
  refresh the account list.
- `src/lib/connect.ts` already exports `isTauri`. Branch on it rather than
  deleting the desktop path, so the Tauri app keeps working.
- Delete the credentials/paste-token UI **from the web path only**.
- `AppCredentials` and `store.settings.credentials` become desktop-only.

### 3. Multiple accounts per platform

`Channel` in `src/lib/model.ts` already has `platform`, `handle` and `project`,
so several Instagram channels can coexist in the frontend model — the gap is
the flow, not the schema.

- Server side already correct: `accounts` is keyed
  `unique (platform, external_id)`, so connecting a second account inserts,
  and reconnecting the same one updates in place.
- Connecting must be repeatable: after one account connects, "Connect another
  Instagram account" must start a fresh flow. Meta will reuse the logged-in
  session, so the user has to switch accounts in Instagram — surface that,
  it looks broken otherwise.
- `api/auth/instagram/start.ts` already passes a `project` query param through
  a cookie into `accounts.project_id`. Wire the UI to send it.
- Settings should group connected accounts by project.

### 4. Sync the frontend to the server

`src/lib/store.tsx` (611 lines) persists the whole workspace to `localStorage`
under `distribution-os:workspace`. The API reads Postgres. Right now they are
two disconnected worlds.

Scope decision to make explicitly rather than drift into: either move the whole
store to the API, or write through only what publishing needs — accounts,
posts, media, targets — leaving the rest local. The second is smaller and
unblocks publishing sooner but leaves two sources of truth. **State the choice
in the PR.**

Add `GET /api/accounts` returning safe fields only — never `access_token_enc`.

### 5. Prove one real publish

Milestone: upload a carousel, hit Publish now, see it on Instagram.

There is **no Instagram sandbox** — the first successful test is a real post on
a real account. Warn the user before firing and use content they don't mind
appearing. Instagram limits: JPEG (PNG unreliable), ≤8 MB, aspect ratio 4:5 to
1.91:1, caption ≤2200 chars, carousel 2–10 slides, 25 published posts per
rolling 24h per account.

### Not now

Cron scheduling. Once manual publish works, a Cloudflare Worker cron (free,
minute granularity) fetches `/api/publish` with the `x-cron-secret` header.
Vercel Hobby cron is once-daily, hence the external trigger. The endpoint
already supports this.

---

## Infrastructure the user must create (needs their login)

1. **Neon** free Postgres → run `db/schema.sql` → `DATABASE_URL`
2. **Cloudflare R2** bucket, private, API token → `R2_*` vars
3. **Vercel env vars** — full list in `.env.example`:
   `APP_URL=https://distributionoss.vercel.app` (exact, no trailing slash —
   must match Meta's registered URI character for character),
   `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `TOKEN_ENC_KEY`
   (`openssl rand -base64 32`), `DATABASE_URL`, `R2_*`, `CRON_SECRET`

Every env getter throws a `ConfigError` naming the missing variable and returns
503, so a misconfiguration says which value is absent.

---

## Rules

- **Git:** sync `main`, branch off it, push the branch, open a PR. Never push to
  `main`, never merge. Remote: `github.com/kartikbandarwad99/Distribution-OS`.
- Keep the Tauri app working. It is the reference implementation.
- Verify rather than assert. Say plainly what was not tested.
