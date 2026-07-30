# Handoff — Distribution OS on Cloudflare

Rewritten 2026-07-30. Supersedes both previous versions.

- The first version was built around Vercel + Neon. Wrong host.
- The second version was built around a one-minute polling cron. Right host,
  crude scheduler.

This version uses **durable timers** (Durable Object alarms) instead of polling.
Every free-tier number below was read from Cloudflare's docs on 2026-07-30 and
is cited. Re-verify before trusting any of it a year from now.

Self-contained: everything needed to act is here.

---

## The one hard constraint

**Everything runs on the Cloudflare free tier. There is no budget. Do not
introduce anything that requires Workers Paid, and do not design something that
quietly needs it at 40 posts/day.**

The only permitted spend is a domain (~$12/yr), for the reason in
"Buy the domain first" below.

If a step cannot be done on the free tier, **stop and say so** rather than
building it and discovering the wall later.

---

## Where things stand

`~/Projects/mysocial` is one repo serving two apps:

- **Tauri desktop app** — `src-tauri/` + `src/`. Works, stays as reference.
  Do not delete it.
- **Hosted web app** — the same `src/` frontend, plus a serverless API in
  `api/`, currently written for Vercel.

Branch `feat/web-foundation` added a complete Instagram backend:

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
no env vars set. The logic is sound; the host is wrong and the scheduler does
not exist yet.

---

## Architecture

### One Worker plus one Durable Object class. That is the entire backend.

```
Cloudflare Worker
├── static assets   → the Vite SPA (same origin as the API, so no CORS)
├── fetch handler   → /api/auth/instagram/*, /api/media/upload-url, /api/publish
├── scheduled       → cron "*/15 * * * *": safety-net sweep ONLY (see below)
├── D1 binding      → projects, accounts, posts, media, post_targets
├── R2 binding      → media staging + presigned GET for Meta to fetch
└── DO binding      → AccountScheduler (one instance per connected account)
                      holds the queue + the alarm; does the publishing
```

One provider, one deploy, one `wrangler.jsonc`. **Vercel is dropped entirely.**

### Why not Vercel

Not because Vercel is bad. Because once the scheduler lives on Cloudflare —
which was always the plan — Vercel is only serving static files and OAuth
callbacks that the Worker can serve itself. Keeping it means two dashboards,
two sets of secrets, and a cross-cloud hop on every database query.

The decisive fact: **Vercel Hobby cron runs once per day with ±59 minutes of
imprecision.** Anything more frequent fails at deploy time. A scheduled-posting
tool cannot be built on that, and the paid tier is out by the constraint above.

### Why D1 and not R2-as-a-database

R2 is an object store with no query layer. Using it as the database means
hand-rolling the uniqueness constraint on `accounts`, the due-query, and the
cascades — writing a small database inside a bucket.

D1 is reached through a **binding** — in-process, no network hop, no API token.
This is also why D1 would have been the wrong choice while still on Vercel:
from outside Cloudflare the only door is the REST API.

### Why Durable Objects and not Neon/Redis/a queue

The DO is not a second database. It is the thing that **holds the timer and
serialises publishing per account**. D1 remains the app's database — what the
UI reads and writes. The DO owns only in-flight publishing state.

Cloudflare Queues is Workers Paid. Redis means another provider. Neither is
needed once alarms exist.

---

## Scheduling: durable timers, not polling

This is the section most likely to be misread. Read all of it before writing
any scheduler code.

### Three models, and why the third one wins

**Model 1 — one cron entry per scheduled post.** Free tier allows **5 Cron
Triggers per account** ([Workers limits][wl]). 40 posts means 40 entries.
Infeasible, and also absurd. Nobody proposed this; it is listed because
mistaking model 3 for model 1 is what made an earlier version of this document
look impossible.

**Model 2 — one cron tick every minute.** `* * * * *`, and each tick asks the
database what is due. This *works*, and was the previous plan. Its costs:

- 1,440 invocations/day, of which ~1,400 find nothing and exit.
- ±60s accuracy at best, and cron firing is best-effort, not guaranteed.
- Every tick runs a `WHERE state='queued' AND scheduled_at <= ?` query. D1
  bills **rows read**, and an unindexed scan counts every row it touches.
  10,000 rows × 1,440 ticks/day = 14.4M rows read against a 5M/day limit
  ([D1 pricing via DO pricing][dp]) — over the limit, from an app that
  published 40 posts.
- Two ticks can overlap, so a publish lock is mandatory. Get it wrong and you
  double-post to a real account, which cannot be taken back.

**Model 3 — a durable timer per account.** Nothing runs until the moment a post
is due. This is the plan.

### How a durable timer actually works

It is worth being precise, because the intuition "a timer means something is
running" is wrong here and drives bad decisions.

`setAlarm()` **writes a timestamp to storage and returns.** The Durable Object
is then evicted from memory. No process, no container, no memory held, nothing
billed. At the deadline, Cloudflare's storage layer recreates the object on some
machine and calls `alarm()`. Between scheduling and firing, the app does not
exist anywhere.

```js
// scheduling a post three weeks out costs exactly this much runtime:
await this.ctx.storage.setAlarm(Date.parse(scheduledAtISO));
// ← returns. Object evicted. Nothing running for three weeks.
```

So 40 scheduled posts are 40 rows containing a date, not 40 running things. You
are renting Cloudflare's clock rather than running your own.

### Precedent: this is what Postiz does

Postiz (`gitroomhq/postiz-app`, open source, AGPL) is the closest comparable
tool. It does **not** poll. From
`apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.5.ts`:

```js
if (!postNow) {
  await sleep(
    dayjs(firstPost.publishDate).isBefore(dayjs())
      ? 0
      : dayjs(firstPost.publishDate).diff(dayjs(), 'millisecond')
  );
}
```

One Temporal workflow per post, sleeping on a durable timer until publish time.
Plus `apps/orchestrator/src/workflows/missing.post.workflow.ts`, an hourly sweep
that catches posts whose timer never fired. Durable timer + slow sweep — the
same two-part design adopted here, reached independently.

What is **not** copyable is their infrastructure. Their `docker-compose.yaml`
runs the app, Postgres, Redis, Temporal, *a second Postgres for Temporal*,
Elasticsearch (`ES_JAVA_OPTS=-Xms256m`), temporal-ui and admin-tools — roughly
eight containers and 2+ GB of RAM, on permanently. Correct for a multi-tenant
SaaS across 20+ platforms. Against the free-tier constraint it is out on the
first line. **Durable Object alarms are the serverless equivalent of Temporal's
durable timer** — same guarantee, no servers.

### One Durable Object per account, not per post

Use `env.ACCOUNT_SCHEDULER.idFromName(accountId)`.

Per-account rather than per-post, for three reasons:

1. **A DO is single-threaded.** One instance handles one thing at a time. That
   makes it a serial queue for the account — no concurrent publishes to the same
   Instagram account, ever, without a lock.
2. **Instagram's rate limit is per account**: 25 published posts per rolling
   24 h. Only an object that can see all of that account's posts can enforce it.
   A per-post object cannot.
3. **A DO can hold only one alarm at a time.** Per-account means the object owns
   a small queue and re-arms for the next-earliest post after each publish —
   which is a feature, since it is also where the rate limit is checked.

The DO keeps its own SQLite table (its working set, not the source of truth):

```sql
CREATE TABLE queue (
  target_id     TEXT PRIMARY KEY,
  scheduled_at  TEXT NOT NULL,          -- ISO-8601 UTC
  state         TEXT NOT NULL,          -- queued | creating | awaiting | publishing | done | error
  container_id  TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  publish_started_at TEXT,              -- idempotency guard, see below
  ig_media_id   TEXT
);
CREATE INDEX queue_due_idx ON queue (scheduled_at) WHERE state != 'done';
```

`state` transitions are mirrored back to D1 so the UI can show progress.

### One step per wake — never sit and wait

Durable Objects bill **compute duration as wall-clock time while active**
([DO pricing][dp]), unlike Workers, which bill CPU only. So a DO that awaits
Meta in a `while` loop for three minutes is billed for three minutes.

Each `alarm()` wake advances one target exactly one step and exits:

```
queued → creating  : POST /media (container), store container_id, setAlarm(+30s)
creating → awaiting : GET container?fields=status_code
                      not FINISHED → setAlarm(+30s), exit
                      FINISHED     → setAlarm(now), exit
awaiting → publishing: POST /media_publish, store ig_media_id
publishing → done   : delete the R2 object, write D1, setAlarm(next queued post)
```

Each wake is 2–4 Meta calls and a few storage reads. This is what keeps duration
negligible, and it means a crashed wake loses nothing — the next one re-reads
state from the DO's own SQLite.

Cap the retry loop: after `attempts >= 5` on the same step, set `state='error'`,
write the reason to D1, and move to the next post. A stuck post must not block
the account's queue forever.

### Alarms are at-least-once — the handler MUST be idempotent

This is the one genuinely dangerous detail, and it is not optional.

Cloudflare's docs are explicit: `alarm()` has **"guaranteed at-least-once
execution and will be retried upon failure using exponential backoff, starting
at two second delays for up to six retries"**, and separately, **"In rare cases,
alarms may fire more than once. Your `alarm()` handler should be safe to run
multiple times"** ([base API][do-base], [rules of DOs][do-rules]).

The DO being single-threaded prevents two *concurrent* publishes. It does **not**
prevent a retry after a partial success — `media_publish` returns 200, the DO
crashes before recording it, the alarm retries, and the same photo posts twice.

Guard it with a write-ahead marker, not a write-behind one:

```js
// BEFORE calling media_publish
await this.sql.exec(
  `UPDATE queue SET publish_started_at = ?, state = 'publishing'
    WHERE target_id = ?`, nowISO, targetId);

// on entering the publishing step, first:
if (row.publish_started_at && !row.ig_media_id) {
  // A previous attempt may have published. Do NOT publish again.
  await this.markUncertain(targetId);   // state='needs_review' in D1
  return;
}
```

`needs_review` surfaces in the UI as "may have posted — check Instagram". That
is the correct trade: a post that needs one manual glance is recoverable, a
duplicate post to a real account is not.

Everything the handler does must tolerate re-running: creating a container twice
is harmless (the old one expires), deleting an R2 object twice is harmless,
`media_publish` twice is **not**.

### The sweep is the safety net, and it is the only cron

One trigger: `"crons": ["*/15 * * * *"]`. 96 invocations/day. It does one thing:

```sql
SELECT id, account_id FROM post_targets
 WHERE state IN ('queued','creating','awaiting','publishing')
   AND scheduled_at <= datetime('now', '-5 minutes')
 LIMIT 20
```

For each row, get the account's DO and poke it to re-arm. This catches the cases
alarms cannot catch themselves: an object deleted, a deploy that dropped an
alarm, a bug that exited without re-arming. Without it, a silent failure leaves a
post stuck forever.

This query **must** hit an index — it is a free-tier requirement, not an
optimisation, for the rows-read reason given under Model 2. `db/schema.sql`
already has `post_targets_due_idx`; keep it through the SQLite port and verify
with `EXPLAIN QUERY PLAN`.

Do not let the sweep grow into the scheduler. If it starts doing the publishing,
you have rebuilt Model 2 by accident.

### What this deletes from the previous plan

- The conditional-UPDATE publish lock (`SET state='publishing' WHERE
  state='queued' ... RETURNING`). Not needed — the DO is single-threaded.
- The 1,440-ticks/day polling query and its rows-read pressure.
- Hand-written retry/backoff. Alarms retry with backoff automatically; you only
  add the attempt cap.

---

## Free-tier budget

Sizing: **40 posts/day, single user, a handful of accounts.** Real expectation is
30–40 posts *per week*, so this is a generous ceiling.

Per-post cost: ~5–6 alarm wakes (1 create, ~3 polls, 1 publish, 1 cleanup).
40 posts/day ≈ **240 alarm invocations/day**.

### Workers ([limits][wl], [pricing][wp])

| Meter | Free limit | This app | Verdict |
|---|---|---|---|
| Requests | 100,000/day | 96 cron + a few hundred UI | 0.5% |
| Requests to static assets | free, unlimited | the whole SPA | free |
| CPU per invocation | **10 ms** | a few queries, no computation | fine — see note |
| External subrequests/invocation | **50** | 2–4 Meta calls | fine |
| Subrequests to CF services/invocation | 1,000 | D1/R2/DO binding calls | fine |
| Simultaneous outgoing connections | 6 | 1–2 | fine |
| Cron Triggers per account | **5** | 1 | fine |
| Worker size | 3 MB | SPA is static assets, not bundle | fine |

**CPU is 10 ms on the free plan, not 30 s.** Time spent awaiting `fetch()` or a
D1 query does *not* count — only computation does. So there is room, but only
while handlers stay thin. Do not add image processing, large JSON transforms, or
a loop over every target in one invocation.

Note the subrequest split, which the previous version of this document got
muddled: free plan is 50 **external** subrequests *and* 1,000 subrequests to
Cloudflare services per invocation. D1 and R2 binding calls are in the 1,000
bucket, not the 50.

### Durable Objects ([pricing][dp])

Free plan supports **SQLite-backed classes only** — declare with
`new_sqlite_classes`. A key-value-backed class will not work.

| Meter | Free limit | This app | Verdict |
|---|---|---|---|
| Requests (incl. **alarm invocations**) | 100,000/day | ~240 | 0.24% |
| Duration (wall-clock while active) | 13,000 GB-s/day | ~240 × ~2 s × 128 MB ≈ 60 GB-s | 0.5% |
| Rows read | 5,000,000/day | a few thousand | fine |
| Rows written (**each `setAlarm()` = 1 row**) | 100,000/day | ~1,000 | 1% |
| SQL stored data | 5 GB | a few KB | fine |

Storage on the free plan is **never charged** — Cloudflare's billing changelog
states free-plan developers will not be charged for SQLite storage.

Duration is the meter to keep an eye on, because it is wall-clock, not CPU. The
13,000 GB-s/day allowance is ~28 hours of active time at 128 MB. The one-step
state machine uses minutes of it. A `while (!ready) await sleep()` loop is how
you would burn it — hence the rule above.

**Not verified:** the per-invocation wall-time ceiling for alarm handlers on the
free plan. It does not bind a handler that exits in ~2 s, but check
`workers/platform/limits/#wall-time-limits-by-invocation-type` before writing
anything long-running.

### D1 and R2

| Meter | Free limit | This app | Verdict |
|---|---|---|---|
| D1 storage | 5 GB | text rows only | effectively unbounded |
| D1 rows written | 100,000/day | ~500 | fine |
| D1 rows read | 5,000,000/day | 96 indexed sweeps + UI | fine *if indexed* |
| R2 storage | 10 GB-month | transient, deleted after publish | ~0 |
| R2 Class A ops | 1M/month | ~2,400 (uploads + deletes) | fine |
| R2 egress | free | Meta fetching media | $0 |

**R2 is a publish queue, not a warehouse.** Bucket stays private. Browser uploads
via presigned PUT; Meta fetches via a presigned GET expiring in an hour; Meta
copies to its own CDN within seconds. `deleteObject()` already exists in
`api/_lib/r2.ts` but is never called — wire it into the `done` transition so
storage stays near zero rather than accumulating.

Note at signup: R2 may ask for a card on file even to use the free allowance.
Confirm that before assuming the account is set up.

### The honest summary

Nothing here is within an order of magnitude of a free-tier limit. The two
places where a careless implementation *would* hit one are both called out
above: unindexed due-queries (rows read) and a handler that waits instead of
re-arming (duration).

[wl]: https://developers.cloudflare.com/workers/platform/limits/
[wp]: https://developers.cloudflare.com/workers/platform/pricing/
[dp]: https://developers.cloudflare.com/durable-objects/platform/pricing/
[do-base]: https://developers.cloudflare.com/durable-objects/api/base/
[do-rules]: https://developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/

---

## The work

### 0. Buy the domain first

Meta's OAuth redirect validation is unreliable against `*.vercel.app` and
`*.workers.dev` because both are on the public suffix list. The redirect URI
must match Meta's registered value character for character, so registering it
twice is wasted effort. Buy the domain, point it at the Worker, register the
callback once.

### 1. Port `api/` to a Worker

~636 lines across 4 endpoints. Mostly mechanical.

- `VercelRequest`/`VercelResponse` → `fetch(request, env, ctx)` returning
  `Response`. Touches all 4 handlers and `api/_lib/http.ts`.
- `process.env` → the `env` parameter, threaded through. Keep the `ConfigError`
  design in `api/_lib/env.ts` — a missing variable returning 503 with the
  variable named is the single most useful thing during setup.
- `api/_lib/r2.ts` — `aws4fetch` was written for Workers. Presigned GET for Meta
  still needed; direct binding calls replace the rest.
- `api/_lib/crypto.ts` — `node:crypto` works under the `nodejs_compat` flag.
  Prefer that over rewriting to WebCrypto; the AES-256-GCM code is already
  tested and a rewrite risks the one component holding 60-day account tokens.
- `api/_lib/db.ts` — `neon()` → `env.DB.prepare(...)`. 47 lines.
- `api/_lib/instagram.ts` — keep the Meta API calls, but **split the inline
  container → poll → publish flow into discrete steps** the DO can call one at a
  time. This is the one non-mechanical change in the port.

Delete `vercel.json` and the `@vercel/node` dependency when the port lands, not
before.

### 2. Port the schema to SQLite

`db/schema.sql` → D1. The shape is right and stays; only Postgres-isms change:

- Drop `create extension pgcrypto`; generate UUIDs in the Worker
  (`crypto.randomUUID()`) instead of `gen_random_uuid()`.
- `timestamptz` → `text` storing ISO-8601 UTC. Compare lexically; it sorts
  correctly. Keep every stored timestamp UTC — no local time in the database.
- `scopes text[]` → a JSON string column.
- Partial index `where state = 'queued'` — SQLite supports partial indexes, so
  this ports as-is. Keep it, and widen it to cover the sweep's state list.
- `check (...)` constraints port as-is.
- Add to `post_targets`: `container_id`, `ig_media_id`, `publish_started_at`,
  `attempts`, `error_reason`, and `needs_review` as a state value.

### 3. Security gate — before any real token is stored

The API as written is completely open: anyone who finds
`/api/auth/instagram/start` can run the OAuth flow and write into `accounts`,
and `/api/publish` accepts anonymous POSTs. A live Meta token must not land in
the database before there is a gate.

Single user, so keep it small: a shared password → signed HttpOnly session
cookie, checked by one helper every route calls. **Do not build multi-tenant
auth.** This is not a SaaS and is not being productized.

### 4. Build the `AccountScheduler` Durable Object

New work, ~200 lines. The heart of the app.

- `new_sqlite_classes` in `wrangler.jsonc`. Free plan requires SQLite-backed.
- `idFromName(accountId)`.
- RPC methods: `enqueue(target)`, `cancel(targetId)`, `poke()` (re-arm from D1),
  `publishNow(targetId)`.
- `alarm()`: pick the earliest due target, advance one step, re-arm. Idempotency
  guard on the publishing step as specified above.
- Rate limit: before publishing, count this account's posts in the last 24 h. At
  25, re-arm past the oldest one's expiry rather than failing.
- **The manual "Publish now" path and the alarm path must call the same step
  functions**, so the thing proven by hand is the thing that runs on a timer.

Test with `runDurableObjectAlarm()` from `cloudflare:test`, which fires a
scheduled alarm immediately instead of waiting. Note the known issue: alarms can
break after a hot reload under `wrangler dev` — restart it rather than debugging
a phantom.

### 5. Real OAuth, replacing the paste-a-token flow

`src/features/settings/SettingsView.tsx` (868 lines) asks for a client ID/secret
and a pasted token, driven by `src/lib/connect.ts` and Tauri `invoke`. That
existed only because Meta rejects loopback redirects and the desktop app had no
public HTTPS callback. It now has one.

- On web, "Connect Instagram" becomes a link to `/api/auth/instagram/start`.
- Callback redirects to `/settings?connected=<handle>`; handle that and refresh.
- `src/lib/connect.ts` already exports `isTauri`. **Branch on it** rather than
  deleting the desktop path, so the Tauri app keeps working.
- Remove the credentials/paste-token UI from the web path only.
- Add `GET /api/accounts` returning safe fields only — never `access_token_enc`.

### 6. Multiple accounts per platform

`accounts` is keyed `unique (platform, external_id)`, so a second account
inserts and a reconnect updates in place. The gap is the flow, not the schema.

- Connecting must be repeatable: after one account connects, "Connect another"
  starts a fresh flow. Meta reuses the logged-in session, so the user must switch
  accounts inside Instagram — **say so in the UI**, it looks broken otherwise.
- `api/auth/instagram/start.ts` already passes `project` through a cookie into
  `accounts.project_id`. Wire the UI to send it.
- Group connected accounts by project in Settings.

### 7. Sync the frontend to the server

`src/lib/store.tsx` (611 lines) persists the whole workspace to `localStorage`
under `distribution-os:workspace`. The API reads the database. Two disconnected
worlds today.

Make this choice explicitly rather than drifting into it: move the whole store
to the API, or write through only what publishing needs — accounts, posts,
media, targets — leaving the rest local. The second is smaller and unblocks
publishing sooner but leaves two sources of truth. **State the choice in the PR.**

### 8. Prove one manual publish

Milestone: upload a carousel, hit Publish now, see it on Instagram.

There is **no Instagram sandbox** — the first successful test is a real post on
a real account. Warn before firing and use content that is fine to have appear.

Instagram limits: JPEG (PNG unreliable), ≤8 MB, aspect ratio 4:5 to 1.91:1,
caption ≤2200 chars, carousel 2–10 slides, 25 published posts per rolling 24 h
per account. That 25/day cap is below the 40/day sizing above — with one account
it is the real ceiling, so multi-account fan-out is what makes 40 reachable.

### 9. Prove one scheduled publish

Schedule a post ~3 minutes out. Watch it fire on its own. Confirm with
`wrangler tail` that the alarm woke, stepped, re-armed, and cleaned up the R2
object. Then schedule one a day out and confirm the alarm survives a deploy in
between — that is the case a timer-based design must be checked against.

### 10. Turn on the sweep

`"triggers": { "crons": ["*/15 * * * *"] }`. Last, not first. Verify it finds
nothing on a healthy queue, then deliberately break an alarm (delete the DO) and
confirm the sweep recovers the post.

---

## Decisions already made — do not relitigate

- **Durable Object alarms, not a polling cron.** Reasoned above with verified
  numbers and the Postiz precedent. The `*/15` cron is a safety net only.
- **Vite, not Next.js.** The frontend was never the missing piece; porting ~30
  iterated React files buys nothing. No SSR/RSC needed. The same Vite build
  deploys to Workers static assets unchanged.
- **This is a single-user tool.** No SaaS, no billing, no team seats, no
  multi-tenancy, no Meta App Review. Earlier sessions explored pricing and unit
  economics — that exploration is closed. Do not design for a second user.
- **Instagram only.** X moved to pay-per-use in Feb 2026 ($0.015/post, $0.20
  with a link) and is deliberately deferred. Threads later.
- **No Meta App Review needed.** All accounts are the user's own, added as
  Instagram Testers while the app is in Development mode. Accounts must be
  Business or Creator.
- **Webhooks deliberately not configured.** This app only publishes outbound.
- **No Temporal, no Redis, no Queues.** Queues is Workers Paid; the other two are
  extra providers solving what alarms solve for free.

---

## Infrastructure the user must create (needs their login)

1. **Domain** (~$12/yr) — the only spend. Point at the Worker.
2. **Cloudflare account** — free plan.
3. **D1 database** — `wrangler d1 create`, run the ported schema.
4. **R2 bucket** — private. No public access, no `r2.dev` domain.
5. **Meta app** — register
   `https://<domain>/api/auth/instagram/callback` as the redirect URI.
6. **Secrets** via `wrangler secret put` (not `vars` — these are credentials):
   `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`,
   `TOKEN_ENC_KEY` (`openssl rand -base64 32`, must decode to exactly 32 bytes),
   `APP_PASSWORD` (the step-3 gate).
   `APP_URL` can be a plain var. D1, R2 and the DO are bindings, not secrets.

`CRON_SECRET` and the `DATABASE_URL`/`R2_*` credential set are not needed — the
cron is internal to the Worker and every store is a binding.

---

## Rules

- **Git:** sync `main`, branch off it, push the branch, open a PR. Never push to
  `main`, never merge. Remote: `github.com/kartikbandarwad99/Distribution-OS`.
- **Free tier or it doesn't ship.** If something needs Workers Paid, stop and
  say so rather than building it.
- Keep the Tauri app working. It is the reference implementation.
- Verify rather than assert. Say plainly what was not tested. Every limit in this
  document is cited; add a citation or a "not verified" note for anything new.
