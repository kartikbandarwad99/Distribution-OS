-- Distribution OS — hosted schema, for D1 (SQLite).
--
-- Ported from the Postgres version. The shape was right and is unchanged: a
-- post is written once and fans out to many accounts, so scheduling, state and
-- failure live on `post_targets`, one row per account per post — never on the
-- post itself.
--
-- Only the Postgres-isms changed:
--   * no pgcrypto; ids are `crypto.randomUUID()` from the Worker
--   * timestamptz -> text holding ISO-8601 UTC. It sorts lexically in the same
--     order it sorts chronologically, which is what makes `scheduled_at <= ?`
--     correct. Every stored timestamp is UTC. There is no local time in this
--     database.
--   * text[] -> a JSON string column
--   * partial indexes and check constraints port as-is

create table if not exists projects (
  id          text primary key,
  name        text not null,
  created_at  text not null
);

create table if not exists accounts (
  id                text primary key,
  project_id        text references projects(id) on delete set null,
  platform          text not null check (platform in ('instagram','threads','x','linkedin')),
  -- Instagram's user ID. This is the {ig-user-id} path parameter every
  -- publishing call needs, so it is resolved once at connect time and stored.
  external_id       text not null,
  handle            text,
  avatar_url        text,
  -- AES-256-GCM, never returned to the browser. See worker/lib/crypto.ts.
  access_token_enc  text not null,
  refresh_token_enc text,
  expires_at        text,
  -- JSON array. SQLite has no array type.
  scopes            text not null default '[]',
  status            text not null default 'active'
                      check (status in ('active','expired','revoked')),
  connected_at      text not null,
  unique (platform, external_id)
);

create table if not exists posts (
  id          text primary key,
  project_id  text references projects(id) on delete cascade,
  kind        text not null check (kind in ('image','carousel','reel','text')),
  caption     text not null default '',
  created_at  text not null,
  updated_at  text not null
);

-- Media lives in R2 only for its publish window; this table is the record of
-- what was there. `evicted_at` is set when the object is deleted, which keeps
-- the row meaningful as history after the bytes are gone.
create table if not exists media (
  id          text primary key,
  post_id     text not null references posts(id) on delete cascade,
  r2_key      text not null unique,
  mime        text not null,
  bytes       integer not null default 0,
  position    integer not null default 0,
  thumb_key   text,
  evicted_at  text
);

create index if not exists media_post_idx on media (post_id, position);

-- One row per (post, account). The unit of scheduling, publishing, retrying
-- and failure.
--
-- `locked_at` is gone: the conditional-UPDATE publish lock it supported is no
-- longer needed, because a Durable Object is single-threaded and one instance
-- owns each account's queue. The columns that replaced it mirror the
-- scheduler's progress so the UI can show it:
--
--   container_id        Meta's container, once created
--   ig_media_id         the published media id, once media_publish returns
--   publish_started_at  written BEFORE media_publish is called. This is the
--                       at-least-once guard: if it is set and ig_media_id is
--                       not, a previous attempt may already have posted, and
--                       the target goes to `needs_review` rather than being
--                       published again. See worker/scheduler.ts.
create table if not exists post_targets (
  id                  text primary key,
  post_id             text not null references posts(id) on delete cascade,
  account_id          text not null references accounts(id) on delete cascade,
  scheduled_at        text,
  state               text not null default 'draft'
                        check (state in ('draft','queued','creating','awaiting',
                                         'publishing','published','failed',
                                         'needs_review')),
  attempts            integer not null default 0,
  container_id        text,
  ig_media_id         text,
  publish_started_at  text,
  platform_post_id    text,
  error_reason        text,
  published_at        text,
  -- When Instagram stopped being able to show us this media: deleted from the
  -- app, or removed by Meta. A column rather than a `state`, deliberately —
  -- the post really did publish, and rewriting history to say otherwise would
  -- lose the publish time and every metric already collected against it. It
  -- also keeps the state check constraint intact, which SQLite cannot alter.
  removed_at          text,
  unique (post_id, account_id)
);

-- The sweep's hot query: what is due and still in flight. This index is a
-- free-tier requirement, not an optimisation — D1 bills rows read, and an
-- unindexed scan counts every row it touches. The state list here must stay in
-- step with IN_FLIGHT_STATES in worker/lib/db.ts, or the sweep silently falls
-- back to a full scan.
create index if not exists post_targets_due_idx
  on post_targets (scheduled_at)
  where state in ('queued','creating','awaiting','publishing');

-- The scheduler's other read: how many posts this account published in the
-- last 24 hours, for the 25-per-rolling-day cap.
create index if not exists post_targets_published_idx
  on post_targets (account_id, published_at)
  where state = 'published';

-- What Instagram reported about a published post, over time.
--
-- Append-only, one row per fetch, rather than a `metrics` column on
-- post_targets. Reach and views keep moving for days after publication; an
-- overwriting column would answer "how is this doing now" and permanently
-- destroy "how did it get there", which is the more interesting question and
-- the one that cannot be reconstructed later.
--
-- `raw` holds Meta's payload verbatim alongside the normalised columns. Meta
-- churns metric names hard — `impressions` gave way to `views`, `video_views`
-- and `profile_views` were removed outright — and without `raw` every rename
-- is a migration that silently drops the history it cannot map. With it, a
-- renamed metric is a read-side change.
--
-- The normalised columns are nullable on purpose: a metric that Instagram does
-- not support for that media type is absent, which is not the same as zero and
-- must not be charted as zero.
create table if not exists post_metrics (
  id           text primary key,
  target_id    text not null references post_targets(id) on delete cascade,
  account_id   text not null references accounts(id) on delete cascade,
  -- Denormalised from post_targets so a fetch needs no join, and so the row
  -- stays meaningful if the target is ever repointed.
  ig_media_id  text not null,
  fetched_at   text not null,
  reach        integer,
  views        integer,
  likes        integer,
  comments     integer,
  shares       integer,
  saved        integer,
  raw          text not null default '{}',
  unique (target_id, fetched_at)
);

-- Both reads this table has: "the latest numbers for these targets" and "the
-- series for this target", which are the same index walked two ways.
create index if not exists post_metrics_target_idx
  on post_metrics (target_id, fetched_at desc);
