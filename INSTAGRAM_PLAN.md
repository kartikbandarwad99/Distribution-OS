# Instagram publishing — implementation plan

Handoff document. Written 2026-07-28. Everything needed to act is in here; no
prior conversation is required.

---

## 1. Where the project actually stands

The app is a Tauri v2 + React + local SQLite "distribution OS". Scheduling
exists in the UI. **Nothing has ever published, on any platform.** Four
independent breaks sit between a scheduled item and a real post. They must be
fixed in order — fixing only the last one changes nothing.

| # | Break | Location | Status |
|---|-------|----------|--------|
| 1 | UI persists to `localStorage`, not SQLite | `src/lib/store.tsx:30` | **open** |
| 2 | `item_targets` table has 0 rows, and the scheduler inner-joins it | `src-tauri/src/publish/mod.rs:132` | **open** |
| 3 | No publisher calls any API — `ManualPublisher` fires a desktop notification | `src-tauri/src/publish/mod.rs:13` | **open** |
| 4 | Instagram fetches media from a public URL; local files have none | Meta API constraint | **open** |

Verified 2026-07-28 against the live DB at
`~/Library/Application Support/com.distributionos.app/distribution-os.sqlite3`:
`content_items` had 8 seeded rows (newest 2026-07-26), `item_targets` had 0
rows, `accounts` had 1 row. A post scheduled through the UI for 2026-07-28
12:10 did not appear in the DB at all — it went to localStorage.

### What already works (do not rebuild)

OAuth and token handling for Instagram is **done and compiles**:

- `src-tauri/src/oauth/mod.rs`
  - `oauth_adopt_token(platform, access_token, client_secret, scopes)` — takes a
    token pasted from Meta's console, exchanges it for a 60-day long-lived
    token (falling back to a refresh if it is already long-lived), then calls
    `/me` to resolve the account. Returns an `OAuthResult`.
  - `oauth_refresh_token(platform, access_token)` — extends by another 60 days.
  - Both registered in `src-tauri/src/lib.rs`.
- `src/lib/connect.ts` — `adoptToken()`, `refreshToken()`, `needsRenewal()`.
- `src/app/Shell.tsx` — renews Meta tokens within 10 days of expiry on launch.
- `src/features/settings/SettingsView.tsx` — paste-token UI for Meta platforms.

**Why a pasted token rather than the OAuth redirect:** Meta rejects loopback
redirect URIs (`http://127.0.0.1:8765/...`) for Instagram business login. It
demands a public HTTPS URL. This was tested — `https://example.com/...` saves
fine, the loopback URL errors. The user has no hosting and does not want any,
so the redirect flow is abandoned for Meta platforms. Their console's
"Generate access tokens" button produces the same token the flow would have.

**Critically:** `OAuthResult.externalId` returned by `oauth_adopt_token` is the
**Instagram user ID**, which is exactly the `{ig-user-id}` path parameter every
publishing call below needs. It is already stored on the channel's `auth`
object. Do not fetch it again.

### Account state

The user's Instagram app is in **Development mode** with themselves added as an
**Instagram Tester** (invite accepted). This is sufficient to publish to their
own account. **App Review is NOT required** and is not a blocker — it is only
needed to publish to other people's accounts. Earlier UI copy claiming
otherwise was wrong and has been corrected.

---

## 2. Phase 0 — prerequisites (blocks everything)

Do not start the Instagram publisher until these are done, or there will be
nothing to publish.

### 0a. Bridge the store to SQLite

`src/lib/store.tsx` writes the whole workspace to `localStorage` under the key
`distribution-os:workspace`. The Rust scheduler reads SQLite. Content created
in the UI is invisible to the backend.

`src/lib/api.ts` already exists as the Tauri command bridge but is imported by
only one file (`src/lib/media.ts`, for asset paths). The DB layer in
`src-tauri/src/db/` has `items.rs`, `accounts.rs`, `schedule.rs` etc. with
commands already registered in `lib.rs` — inspect what is there before writing
new ones.

Scope decision for whoever picks this up: either migrate the store wholesale to
SQLite, or write through to SQLite on the specific mutations that matter for
scheduling (create item, set targets, set schedule) while leaving the rest in
localStorage. The second is smaller and unblocks publishing sooner, but leaves
two sources of truth — call it explicitly rather than drifting into it.

Existing localStorage data should be migrated, not dropped.

### 0b. Populate `item_targets`

Scheduling an item to a channel must insert a row with `status = 'queued'`.
Without this the scheduler query returns zero rows regardless of everything
else. Confirm the schema in `src-tauri/src/db/migrations/` before writing.

### 0c. Verify the pipeline before building the publisher

Insert a row by hand into `content_items` + `item_targets` with
`scheduled_for` a minute in the future and confirm the existing
`ManualPublisher` fires its desktop notification. This proves the scheduler
loop, the query, and the join all work before any API code is written. If the
notification does not fire, fix that first — it is not an Instagram problem.

---

## 3. Phase 1 — decide media hosting (the real Instagram problem)

Instagram's content publishing API does **not** accept file uploads for images.
`POST /{ig-user-id}/media` takes `image_url=<public https url>` and **Meta's
servers fetch it**. A local-first desktop app has no such URL. This must be
solved before any publishing code is useful.

The URL only needs to be reachable for the few seconds Meta takes to fetch it.

### Option A — ephemeral tunnel (recommended; fits the "no hosting" constraint)

Serve the image from a short-lived local HTTP server and expose it via
`cloudflared tunnel --url http://127.0.0.1:<port>`, which returns a
`*.trycloudflare.com` HTTPS URL with **no account and no signup**. Publish,
then tear the tunnel down.

- Pro: no account, no hosting, nothing persistent, matches the project's
  local-first stance. The existing loopback listener code in `oauth/mod.rs`
  is a working reference for a minimal Rust HTTP server.
- Con: requires the `cloudflared` binary present on the machine (detect it and
  give a clear error if missing); tunnel takes ~2–5s to establish; the project
  gains an external process dependency.

### Option B — object storage (Cloudflare R2 or S3)

Upload the image to a public bucket, publish, optionally delete after.

- Pro: reliable, fast, no local server, no extra process.
- Con: requires an account and credentials — the user explicitly declined
  hosting during setup, so **confirm before assuming this is acceptable**.

### Option C — do not publish images at all

Publish only where media is not required. Not viable for Instagram: every
Instagram post requires media. Listed only to be dismissed.

**Ask the user to choose A or B before writing code.** This decision shapes the
whole publisher.

Note: video/Reels has a direct resumable upload path that bypasses this
problem, but images do not. If the user only ever posts Reels the calculus
changes — worth asking.

---

## 4. Phase 2 — the Instagram publisher

Add `src-tauri/src/publish/instagram.rs` behind the existing `Publisher` trait
in `publish/mod.rs`. Reuse the `get_json` / `post_form` helpers already in
`oauth/mod.rs` (make them `pub(crate)` or move them to a shared `http` module —
do not duplicate them).

Base URL: `https://graph.instagram.com/v23.0`

### Single image

1. **Create container**
   `POST /{ig-user-id}/media`
   body: `image_url=<public url>&caption=<text>&access_token=<token>`
   → `{ "id": "<container-id>" }`

2. **Poll readiness**
   `GET /{container-id}?fields=status_code&access_token=<token>`
   → `status_code` one of `EXPIRED | ERROR | FINISHED | IN_PROGRESS | PUBLISHED`
   Wait for `FINISHED`. Poll every ~2s, cap at ~60s, fail loudly on `ERROR` /
   `EXPIRED`. Skipping this is the most common cause of intermittent failures.

3. **Publish**
   `POST /{ig-user-id}/media_publish`
   body: `creation_id=<container-id>&access_token=<token>`
   → `{ "id": "<media-id>" }`

Store the returned media ID — the `published_posts` table already exists in the
schema and should presumably receive it.

### Carousel (2–10 items)

1. Create each child with `image_url=...&is_carousel_item=true` (no caption).
2. Poll each child to `FINISHED`.
3. Create parent: `media_type=CAROUSEL&children=<id1,id2,...>&caption=<text>`
4. Poll parent, then `media_publish` the parent.

Note the app's `RULES.instagram.maxSlides` is currently **20** in
`src/lib/model.ts` — Instagram's carousel limit is **10**. Fix that constant.

### Reels

`media_type=REELS&video_url=<public url>&caption=<text>`, then poll — video
processing genuinely takes time here, so the polling loop matters more.

### Rate limit

25 published posts per rolling 24 hours. Check before publishing:
`GET /{ig-user-id}/content_publishing_limit?fields=quota_usage&access_token=...`
Surface this to the user rather than letting the publish fail opaquely.

### Media requirements (validate before upload, fail early with a clear message)

- JPEG. PNG is not reliably supported — convert or reject.
- Aspect ratio between 4:5 and 1.91:1.
- Max ~8 MB.
- Caption max 2200 chars (already correct in `model.ts`).

### Error handling

Meta returns `{"error":{"message": "..."}}`. The `meta_error()` helper in
`oauth/mod.rs` already parses this — reuse it. Surface `message` verbatim; the
numeric codes mean nothing to the user. Common failures worth special-casing:
token expired, media fetch failed (bad/unreachable URL), rate limit hit,
account not a Business/Creator account.

---

## 5. Phase 3 — wiring

- Register the publisher in `publisher_for()` in `publish/mod.rs`.
- Set `RULES.instagram.manualOnly = false` in `src/lib/model.ts` **only once
  publishing genuinely works** — that flag drives the composer's "will not
  publish" warning, and flipping it early makes the UI lie again.
- On success set `item_targets.status = 'posted'`; on failure record the error
  and leave it visible rather than silently retrying.
- The `Announced` dedupe set in `publish/mod.rs` prevents double-firing within
  a session — make sure a *failed* publish does not get permanently marked as
  announced, or a retry becomes impossible without a restart.

---

## 6. Testing

1. Hand-insert a `content_items` + `item_targets` row scheduled 1 minute out.
2. Confirm the notification path still works (Phase 0c).
3. Publish a single test image to the user's real account — there is no Meta
   sandbox for this, so the first successful test is a real post. Warn the user
   before firing it, and use something they do not mind appearing on the feed.
4. Verify the media ID comes back and the post is visible on the account.
5. Then carousel, then Reels.

Token expiry is 60 days with auto-renewal already implemented — but if testing
spans a stale token, `oauth_refresh_token` is the recovery path, and re-pasting
from the console always works.

---

## 7. Things not to repeat

- Do not try to register a loopback redirect URI with Meta. It is rejected.
  This was tested and confirmed.
- Do not add a webhook. Webhooks are for inbound events (comments, mentions,
  DMs). This app only publishes outbound and requests only
  `instagram_business_basic` + `instagram_business_content_publish`. The
  "app must be in published state" warning in Meta's console applies to
  webhooks and is irrelevant here.
- Do not pursue App Review. Development mode + Instagram Tester covers posting
  to the user's own account.
- Do not build the Instagram publisher before Phase 0. It will have no data.
