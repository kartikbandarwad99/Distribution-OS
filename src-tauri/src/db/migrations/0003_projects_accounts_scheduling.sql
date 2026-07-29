-- Distribution — multi-account targeting and real scheduling.
--
-- Three gaps this closes:
--   1. Accounts lived in localStorage, so nothing could point at them.
--   2. scheduled_at was a date with no time of day.
--   3. One item could only carry a single platform string, so a post could
--      never go to two accounts.
--
-- Not idempotent (ALTER TABLE). Guarded by PRAGMA user_version in mod.rs.

PRAGMA foreign_keys = ON;

-- ── Accounts ────────────────────────────────────────────────────────────────
-- Replaces the localStorage list. is_global = 1 means "available in every project".
CREATE TABLE IF NOT EXISTS accounts (
    id                TEXT PRIMARY KEY,
    platform          TEXT NOT NULL,              -- x | instagram | threads | linkedin
    handle            TEXT NOT NULL,              -- '@mysocialapp'
    display_name      TEXT,                       -- 'mysocial'
    avatar_path       TEXT,                       -- file in app data dir, nullable
    is_global         INTEGER NOT NULL DEFAULT 0,
    connection_status TEXT NOT NULL DEFAULT 'manual',  -- manual | connected | expired
    order_index       INTEGER NOT NULL DEFAULT 0,
    created_at        TEXT NOT NULL,
    updated_at        TEXT NOT NULL,
    deleted_at        TEXT,
    sync_status       TEXT NOT NULL DEFAULT 'local'
);

-- Non-global accounts are linked to one or more projects.
CREATE TABLE IF NOT EXISTS account_projects (
    account_id TEXT NOT NULL REFERENCES accounts(id)  ON DELETE CASCADE,
    project_id TEXT NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    PRIMARY KEY (account_id, project_id)
);

-- ── Scheduling ──────────────────────────────────────────────────────────────
-- Real local timestamp. scheduled_at (date-only) is left in place but MUST NOT
-- be read by new code; treat it as dead.
ALTER TABLE content_items ADD COLUMN scheduled_for TEXT;  -- '2026-07-25T11:30:00'
ALTER TABLE content_items ADD COLUMN timezone      TEXT;  -- IANA, e.g. 'Asia/Kolkata'

UPDATE content_items
   SET scheduled_for = scheduled_at || 'T09:00:00'
 WHERE scheduled_at IS NOT NULL AND scheduled_for IS NULL;

-- ── One item → many accounts ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_targets (
    id           TEXT PRIMARY KEY,
    item_id      TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    account_id   TEXT NOT NULL REFERENCES accounts(id)      ON DELETE CASCADE,
    status       TEXT NOT NULL DEFAULT 'queued',  -- queued | posted | failed | skipped
    posted_at    TEXT,
    external_url TEXT,
    error        TEXT,
    UNIQUE(item_id, account_id)
);

-- ── Threads and carousels are ordered parts ─────────────────────────────────
CREATE TABLE IF NOT EXISTS item_parts (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    order_index INTEGER NOT NULL DEFAULT 0,
    body        TEXT NOT NULL DEFAULT '',
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);

-- Images attach to a specific part (slide 3 of a carousel, tweet 2 of a thread).
ALTER TABLE item_assets ADD COLUMN part_id TEXT REFERENCES item_parts(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_accounts_platform  ON accounts(platform);
CREATE INDEX IF NOT EXISTS idx_acctproj_project   ON account_projects(project_id);
CREATE INDEX IF NOT EXISTS idx_items_sched_for    ON content_items(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_targets_item       ON item_targets(item_id);
CREATE INDEX IF NOT EXISTS idx_targets_account    ON item_targets(account_id);
CREATE INDEX IF NOT EXISTS idx_parts_item         ON item_parts(item_id, order_index);

-- ── Vocabulary normalisation ────────────────────────────────────────────────
-- 0002 spoke 'tweet' and 'ready'; §2 of the spec fixes the strings.
UPDATE content_items SET kind   = 'post'  WHERE kind   = 'tweet';
UPDATE content_items SET status = 'draft' WHERE status = 'ready';

-- Every pre-existing item body becomes part 1, so the composer has something
-- to open. Threads split on a blank line, which is how they were written.
INSERT INTO item_parts (id, item_id, order_index, body, created_at, updated_at)
SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4'
         || substr(lower(hex(randomblob(2))), 2) || '-a'
         || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))),
       id, 0, COALESCE(body, ''), created_at, updated_at
  FROM content_items
 WHERE deleted_at IS NULL
   AND body IS NOT NULL AND body <> ''
   AND NOT EXISTS (SELECT 1 FROM item_parts p WHERE p.item_id = content_items.id);
