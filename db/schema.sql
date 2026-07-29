-- Distribution OS — hosted schema.
--
-- Deliberately not a port of the Tauri SQLite schema. The desktop app split
-- its truth between localStorage and SQLite and inner-joined a table that was
-- never populated; rebuilding on Postgres is the chance to not inherit that.
--
-- The shape that matters: a post is written once and fans out to many
-- accounts, so scheduling, state and failure live on `post_targets`, one row
-- per account per post — never on the post itself.

create extension if not exists "pgcrypto";

create table if not exists projects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists accounts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete set null,
  platform          text not null check (platform in ('instagram','threads','x','linkedin')),
  -- Instagram's user ID. This is the {ig-user-id} path parameter every
  -- publishing call needs, so it is resolved once at connect time and stored.
  external_id       text not null,
  handle            text,
  avatar_url        text,
  -- AES-256-GCM, never returned to the browser. See api/_lib/crypto.ts.
  access_token_enc  text not null,
  refresh_token_enc text,
  expires_at        timestamptz,
  scopes            text[] not null default '{}',
  status            text not null default 'active'
                      check (status in ('active','expired','revoked')),
  connected_at      timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists posts (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid references projects(id) on delete cascade,
  kind        text not null check (kind in ('image','carousel','reel','text')),
  caption     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Media lives in R2 only for its publish window; this table is the record of
-- what was there. `evicted_at` is set when the object is deleted, which keeps
-- the row meaningful as history after the bytes are gone.
create table if not exists media (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references posts(id) on delete cascade,
  r2_key      text not null unique,
  mime        text not null,
  bytes       bigint not null default 0,
  position    int not null default 0,
  thumb_key   text,
  evicted_at  timestamptz
);

create index if not exists media_post_idx on media (post_id, position);

-- One row per (post, account). The unit of scheduling, publishing, retrying
-- and failure. `locked_at` is what stops two concurrent cron ticks from
-- publishing the same target twice.
create table if not exists post_targets (
  id                uuid primary key default gen_random_uuid(),
  post_id           uuid not null references posts(id) on delete cascade,
  account_id        uuid not null references accounts(id) on delete cascade,
  scheduled_at      timestamptz,
  state             text not null default 'draft'
                      check (state in ('draft','queued','publishing','published','failed')),
  attempts          int not null default 0,
  locked_at         timestamptz,
  platform_post_id  text,
  error             text,
  published_at      timestamptz,
  unique (post_id, account_id)
);

-- The scheduler's hot query: what is due, and not already being worked on.
create index if not exists post_targets_due_idx
  on post_targets (scheduled_at)
  where state = 'queued';
