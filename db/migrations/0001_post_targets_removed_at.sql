-- Adds post_targets.removed_at, for media that is no longer on Instagram.
--
-- The first migration in this repo: db/schema.sql stays the description of the
-- database as it should be, and this is how an already-deployed one catches up.
-- Apply with:
--
--   npx wrangler d1 execute distribution-os --remote \
--     --file db/migrations/0001_post_targets_removed_at.sql
--
-- SQLite has no `add column if not exists`, so running this twice errors with
-- "duplicate column name". That is harmless and means it is already applied.

alter table post_targets add column removed_at text;
