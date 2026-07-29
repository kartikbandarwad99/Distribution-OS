-- Distribution OS — content-first model (Phase 1 rebuild)
-- Replaces the idea→variant→asset flow with folders + content items you can
-- organize like a file manager and schedule on a calendar.
-- Same cloud-ready conventions: id UUID, created_at/updated_at/deleted_at, sync_status.

PRAGMA foreign_keys = ON;

-- Folders form a tree per project. parent_id NULL = a top-level folder.
CREATE TABLE IF NOT EXISTS folders (
    id          TEXT PRIMARY KEY,
    project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id   TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    sync_status TEXT NOT NULL DEFAULT 'local'
);

-- A content item is the real thing you make: a carousel, tweet, thread, image
-- or note. It lives in a folder (or unfiled) and can carry a scheduled date.
CREATE TABLE IF NOT EXISTS content_items (
    id           TEXT PRIMARY KEY,
    project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    folder_id    TEXT REFERENCES folders(id) ON DELETE SET NULL, -- NULL = Unfiled
    title        TEXT NOT NULL,
    kind         TEXT NOT NULL DEFAULT 'carousel', -- carousel|tweet|thread|image|note
    platform     TEXT,                             -- x|instagram|threads|NULL
    body         TEXT,                             -- text for tweet/thread/note
    status       TEXT NOT NULL DEFAULT 'idea',     -- idea|ready|scheduled|published
    scheduled_at TEXT,                             -- 'YYYY-MM-DD' when placed on the calendar
    order_index  INTEGER NOT NULL DEFAULT 0,
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL,
    deleted_at   TEXT,
    sync_status  TEXT NOT NULL DEFAULT 'local'
);

-- Files that belong to an item. A carousel is an item with N ordered images.
CREATE TABLE IF NOT EXISTS item_assets (
    id          TEXT PRIMARY KEY,
    item_id     TEXT NOT NULL REFERENCES content_items(id) ON DELETE CASCADE,
    file_path   TEXT NOT NULL,        -- path inside the app data dir
    order_index INTEGER NOT NULL DEFAULT 0,
    alt_text    TEXT,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL,
    deleted_at  TEXT,
    sync_status TEXT NOT NULL DEFAULT 'local'
);

CREATE INDEX IF NOT EXISTS idx_folders_project   ON folders(project_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent    ON folders(parent_id);
CREATE INDEX IF NOT EXISTS idx_items_project      ON content_items(project_id);
CREATE INDEX IF NOT EXISTS idx_items_folder       ON content_items(folder_id);
CREATE INDEX IF NOT EXISTS idx_items_scheduled    ON content_items(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_item_assets_item   ON item_assets(item_id);
