# Multi-account connect + Instagram metrics

## What already works (verified, not rebuilt)

- `accounts` is unique on `(platform, external_id)`, so a second Instagram
  account inserts rather than colliding. Reconnecting the same one refreshes
  the token in place. — `db/schema.sql`
- `post_targets` is already one row per (post, account): scheduling, state and
  failure are per-account. Fan-out to N accounts needs no schema change.
- `post_targets.ig_media_id` and `platform_post_id` are persisted at publish
  time by `worker/scheduler.ts`. That is the join key metrics need, and it is
  already there for posts published before this change.
- Settings already groups accounts by project and renders N of them.

So the gaps are narrower than they look: the OAuth screen, the insights scope,
and the entire read path for metrics.

## Gap 1 — the OAuth screen reuses the browser's Instagram session

`worker/routes/instagram-auth.ts` builds the authorize URL without
`force_reauth`, so Instagram silently re-offers the account already logged in.

Fix: `GET /api/auth/instagram/start?switch=1` sets `force_reauth=true`.
"Connect another account" uses it; a per-account "Reconnect" does not, so
refreshing an expiring token stays one click.

## Gap 2 — the insights scope is not requested

`SCOPES` lists only basic + content_publish. Adding
`instagram_business_manage_insights` only affects tokens issued afterwards —
tokens are immutable snapshots of the scopes granted at issue. Every already
connected account must run the flow again.

So: store the granted scopes (already done), and have Settings show a
"Reconnect for analytics" prompt on any account whose stored scopes lack it,
rather than failing mysteriously at fetch time.

## Gap 3 — nothing reads insights

`Metrics` exists in `src/lib/model.ts` and `AnalyticsView` renders it, but
`metrics` is set to null at creation and never written. Building:

### Schema — `post_metrics`

Metrics are time-varying. Overwriting a column loses the history that makes
analytics worth having, so this is an append table keyed by
`(target_id, fetched_at)`, with a `raw` JSON column alongside the normalised
ones.

The `raw` column is the important part: Meta churns metric names constantly
(`impressions` deprecated in favour of `views`, `video_views` removed,
`profile_views` removed). Storing the raw payload means a renamed metric is a
read-side change, not a migration plus lost history.

### `worker/lib/insights.ts`

Two calls per media, because they have different reliability:

1. `GET /{ig-media-id}?fields=like_count,comments_count,media_type,permalink,timestamp`
   — plain node fields, not the insights edge. Stable across versions and
   available without the insights scope.
2. `GET /{ig-media-id}/insights?metric=reach,saved,shares,views` — the volatile
   part. If Meta rejects a metric for that media type, the error names it; drop
   it and retry once with the remainder rather than losing the whole fetch.

### Routes

- `GET /api/metrics?postId=…` — latest row per target, for the UI.
- `POST /api/metrics/refresh` — refresh published targets, bounded per call,
  oldest-first, skipping anything fetched within the last hour.

The cron trigger stays commented out (HANDOFF step 10), but the refresh is
wired into `scheduled` so turning it on is a config change.

### Frontend

- `Metrics` gains `views`; `impressions` becomes optional legacy.
- A hook merges server metrics onto local pieces by post id.
- AnalyticsView reads real numbers and stays honest-empty when there are none.

## Not built, deliberately

Real multi-tenancy. Auth is one shared password (`worker/lib/auth.ts`); every
query is unscoped because there is exactly one operator. Supporting multiple
customers means a `users` table, `owner_id` on accounts/posts/projects, and
scoping in every query — a much larger change that should wait for a second
customer to exist.
