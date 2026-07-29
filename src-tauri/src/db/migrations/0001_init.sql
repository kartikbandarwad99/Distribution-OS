-- Distribution OS — initial schema (Phase 0)
-- Cloud-ready conventions on every table:
--   id TEXT PRIMARY KEY (UUID), created_at, updated_at, deleted_at NULL, sync_status.
-- Timestamps are ISO-8601 UTC strings. deleted_at NULL = live row (soft delete).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Projects & accounts
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    description  TEXT,
    website      TEXT,
    logo_path    TEXT,
    brand_colors TEXT,                 -- json array of hex strings
    is_personal  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    sync_status  TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS social_accounts (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL,        -- threads | x | instagram
    handle       TEXT,
    display_name TEXT,
    account_type TEXT,                 -- personal | business | creator
    keychain_ref TEXT,                 -- reference into OS keychain (Phase 3)
    token_expiry TEXT,
    scopes       TEXT,                 -- json array
    health       TEXT NOT NULL DEFAULT 'connected', -- connected|expired|reauth|error
    connected_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    sync_status  TEXT NOT NULL DEFAULT 'local'
);

-- ---------------------------------------------------------------------------
-- Content knowledge base (Phase 1 — the foundation)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS core_ideas (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    title       TEXT NOT NULL,
    thesis      TEXT,
    tags        TEXT NOT NULL DEFAULT '[]', -- json array of strings
    status      TEXT NOT NULL DEFAULT 'idea',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    sync_status TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS content_variants (
    id           TEXT PRIMARY KEY,
    core_idea_id TEXT NOT NULL REFERENCES core_ideas(id) ON DELETE CASCADE,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    platform     TEXT NOT NULL,        -- threads | x | instagram | generic
    kind         TEXT NOT NULL DEFAULT 'text', -- text|thread|carousel|image|article|link|note
    title        TEXT,
    body         TEXT,
    status       TEXT NOT NULL DEFAULT 'idea', -- idea|draft|ready|scheduled|published|analyzing|repurpose
    scheduled_at TEXT,
    published_at TEXT,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    sync_status  TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS assets (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    variant_id  TEXT REFERENCES content_variants(id) ON DELETE SET NULL,
    kind        TEXT NOT NULL,         -- image | carousel | document
    file_path   TEXT NOT NULL,         -- path inside the app data dir
    order_index INTEGER NOT NULL DEFAULT 0, -- carousel ordering
    alt_text    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    sync_status TEXT NOT NULL DEFAULT 'local'
);

-- ---------------------------------------------------------------------------
-- Publishing / analytics / engagement (schema now, wired in later phases)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS scheduled_posts (
    id              TEXT PRIMARY KEY,
    variant_id      TEXT NOT NULL REFERENCES content_variants(id) ON DELETE CASCADE,
    account_id      TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    run_at          TEXT NOT NULL,
    state           TEXT NOT NULL DEFAULT 'queued', -- queued|claimed|publishing|published|failed|late
    attempts        INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    platform_post_id TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    sync_status     TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS published_posts (
    id               TEXT PRIMARY KEY,
    variant_id       TEXT NOT NULL REFERENCES content_variants(id) ON DELETE CASCADE,
    account_id       TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    platform_post_id TEXT,
    permalink        TEXT,
    published_at     TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    deleted_at       TEXT,
    sync_status      TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS post_metrics (
    id                TEXT PRIMARY KEY,
    published_post_id TEXT NOT NULL REFERENCES published_posts(id) ON DELETE CASCADE,
    captured_at       TEXT NOT NULL,
    metric_key        TEXT NOT NULL,
    metric_value      REAL,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS engagement (
    id                 TEXT PRIMARY KEY,
    account_id         TEXT NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
    published_post_id  TEXT REFERENCES published_posts(id) ON DELETE SET NULL,
    platform_comment_id TEXT,
    author             TEXT,
    text               TEXT,
    kind               TEXT NOT NULL DEFAULT 'comment', -- comment | reply
    state              TEXT NOT NULL DEFAULT 'unread',  -- unread|read|important|archived
    received_at        TEXT,
    reply_platform_id  TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    deleted_at         TEXT,
    sync_status        TEXT NOT NULL DEFAULT 'local'
);

-- ---------------------------------------------------------------------------
-- Launch tracker / attribution (schema now, wired in later phases)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS launch_campaigns (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    launch_date TEXT,
    status      TEXT NOT NULL DEFAULT 'planning',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    sync_status TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS launch_platforms (
    id              TEXT PRIMARY KEY,
    campaign_id     TEXT NOT NULL REFERENCES launch_campaigns(id) ON DELETE CASCADE,
    name            TEXT NOT NULL,
    url             TEXT,
    submission_date TEXT,
    status          TEXT NOT NULL DEFAULT 'todo',
    launch_date     TEXT,
    notes           TEXT,
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT,
    sync_status     TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS tracking_links (
    id                 TEXT PRIMARY KEY,
    campaign_id        TEXT NOT NULL REFERENCES launch_campaigns(id) ON DELETE CASCADE,
    launch_platform_id TEXT REFERENCES launch_platforms(id) ON DELETE SET NULL,
    source             TEXT,
    medium             TEXT,
    campaign_slug      TEXT,
    generated_url      TEXT,
    created_at         TEXT NOT NULL,
    updated_at         TEXT NOT NULL,
    deleted_at         TEXT,
    sync_status        TEXT NOT NULL DEFAULT 'local'
);

CREATE TABLE IF NOT EXISTS attribution_events (
    id               TEXT PRIMARY KEY,
    project_id       TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    tracking_link_id TEXT REFERENCES tracking_links(id) ON DELETE SET NULL,
    utm              TEXT,               -- json
    event            TEXT NOT NULL,      -- visit | signup | activation
    external_id      TEXT,
    occurred_at      TEXT,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL,
    deleted_at       TEXT,
    sync_status      TEXT NOT NULL DEFAULT 'local'
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_core_ideas_project ON core_ideas(project_id);
CREATE INDEX IF NOT EXISTS idx_variants_idea      ON content_variants(core_idea_id);
CREATE INDEX IF NOT EXISTS idx_variants_project   ON content_variants(project_id);
CREATE INDEX IF NOT EXISTS idx_assets_variant     ON assets(variant_id);
CREATE INDEX IF NOT EXISTS idx_accounts_project   ON social_accounts(project_id);

-- ---------------------------------------------------------------------------
-- Full-text search over ideas + variants (Phase 1 Search.tsx)
-- One FTS5 table; `ref` = 'idea' | 'variant', `ref_id` points at the row.
-- ---------------------------------------------------------------------------
CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
    ref UNINDEXED,
    ref_id UNINDEXED,
    project_id UNINDEXED,
    title,
    body,
    tokenize = 'porter unicode61'
);
