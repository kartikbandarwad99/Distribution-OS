# Distribution — Build Spec

**Read this first, then open `public/concept-v4.html` in a browser. That file is the
visual and structural source of truth.** Where this document and the concept disagree,
the concept wins. Serve it with `npm run dev` → `http://localhost:1440/concept-v4.html`.

This spec replaces `DESIGN_PLAN.md`, `IMPLEMENTATION_PLAN.md`, `PRODUCT_UI_REVAMP_PLAN.md`,
and `GROUND_UP_UI_REBUILD_SPEC.md`. Those four describe abandoned directions — delete them
when Phase 0 lands.

---

## 0. What this app is

A **local-first macOS social scheduler for one person running several products.**
Tauri v2 + React + SQLite, everything on disk, no server, no account.

The owner runs multiple products ("projects"). Each project has its own content and its own
social accounts — but some accounts (a personal handle) are shared across every project.
He writes posts, threads, carousels and reels, targets them at one or more accounts, puts
them on a timeline, and browses everything he's made in one place.

### The three things that must be true

1. **Multi-account is first-class.** Two X accounts, two Instagram accounts, a LinkedIn —
   all visible at once, all targetable from one composer.
2. **Projects scope everything**, and accounts can be project-scoped *or* global.
3. **Never more than three columns on screen.** This is the constraint that keeps it calm.

### Non-goals

Do not build: a team/collaboration layer, a Notion clone, an analytics dashboard, an AI
caption generator, a separate task manager, cloud sync, or a web version.

---

## 1. Current state of the repo — what to keep and what to delete

### Delete outright

- `src/v2/**` — seven files of minified one-liners from an abandoned redesign. Nothing to
  salvage. This is what the router currently points at.
- `src/features/library/PlanBoard.tsx`, `Plan.tsx`, `Canvas.tsx`, `AssetCanvas.tsx` — the
  week-board and freeform-canvas directions were both rejected.
- `src/app/Placeholder.tsx`
- `public/concept.html`, `dist/**`
- The four planning `.md` files listed above.

### Park, don't delete

- `src/features/preview/{XProfile,InstagramProfile,ThreadsProfile,IgPost,PreviewRail,util}.tsx`
  — the phone mockups. **The mobile preview is out of scope for v1.** Leave these files on
  disk, unreferenced by the router. Do not spend time re-skinning them. When they come back,
  they stay true to the real platforms (white X, dark IG) and never take the warm palette.

### Keep and re-skin

- `src/lib/api.ts` — the Tauri `invoke` wrappers. Extend it; don't rewrite from scratch.
- `src/app/ProjectContext.tsx`, `ThemeContext.tsx` — extend.
- Everything in `src-tauri/src/db/` except as amended in Phase 1.

### Delete after migrating its data

- `src/lib/accounts.ts` — accounts currently live in **localStorage**, which is why they
  connect to nothing. They become a real table in Phase 1. Write a one-time migration that
  reads the old `distribution-os:connected-accounts` key on first launch, inserts the rows,
  and clears the key.

---

## 2. Data model

The existing schema cannot express the product. Two blocking gaps:

- `content_items.scheduled_at` is `'YYYY-MM-DD'` — **a date with no time of day.**
  A scheduler needs a timestamp.
- `content_items.platform` is a single nullable string. One post cannot target two accounts,
  and no row anywhere points at an account.

Add `src-tauri/src/db/migrations/0003_projects_accounts_scheduling.sql`:

```sql
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
```

### Vocabulary (use these exact strings)

| Field | Values |
|---|---|
| `accounts.platform` | `x` · `instagram` · `threads` · `linkedin` |
| `content_items.kind` | `post` · `thread` · `carousel` · `reel` · `image` · `article` · `note` |
| `content_items.status` | `idea` · `draft` · `scheduled` · `published` · `failed` |
| `item_targets.status` | `queued` · `posted` · `failed` · `skipped` |

### The one query that defines the product

Accounts visible in project `P`:

```sql
SELECT * FROM accounts
 WHERE deleted_at IS NULL
   AND (is_global = 1
        OR id IN (SELECT account_id FROM account_projects WHERE project_id = ?1))
 ORDER BY platform, order_index, handle;
```

When the project switcher is set to **All projects**, pass `NULL` and return every account.

### Notes are not a separate type

A note is `kind = 'note'`, `status = 'idea'`, no targets, no `scheduled_for`. It renders in
the same list rows and the same editor as everything else. "Turn into post" = set a kind,
add a target, set a time. **Do not build a second editor, a second table, or a todo system.**
Checkboxes inside a note body are plain markdown `- [ ]`.

---

## 3. Rust commands to add

New file `src-tauri/src/db/accounts.rs`, registered in `lib.rs`:

```
list_accounts(project_id: Option<String>) -> Vec<Account>   // the query above
create_account(platform, handle, display_name, is_global, project_ids) -> Account
update_account(id, patch) -> Account
set_account_projects(account_id, is_global, project_ids) -> ()
delete_account(id) -> ()
```

New file `src-tauri/src/db/schedule.rs`:

```
list_queue(project_id: Option<String>, from: String, to: String) -> Vec<QueueEntry>
    // items with scheduled_for in range, plus their targets and first 4 assets,
    // ordered by scheduled_for ASC. Include items with NULL scheduled_for but
    // status='draft' at the end — the concept shows these as "Needs a time".
schedule_item(item_id, scheduled_for, timezone) -> ()
unschedule_item(item_id) -> ()
set_item_targets(item_id, account_ids: Vec<String>) -> ()
next_due(project_id: Option<String>) -> Option<QueueEntry>   // drives the sidebar footer
```

Extend `src-tauri/src/db/items.rs`:

```
list_library(project_id, kind_filter: Option<String>, query: Option<String>) -> Vec<LibraryItem>
list_item_parts(item_id) -> Vec<ItemPart>
upsert_item_part(item_id, part_id: Option<String>, order_index, body) -> ItemPart
delete_item_part(part_id) -> ()
reorder_item_parts(item_id, ordered_ids: Vec<String>) -> ()
```

Extend `src-tauri/src/db/projects.rs`: `create_project`, `delete_project` (the existing file
only lists and updates).

Mirror every command in `src/lib/api.ts` with a typed wrapper. Keep the existing style.

---

## 4. Design system

Copy the `:root` block verbatim from `public/concept-v4.html` into `src/styles/tokens.css`.
Summary of the intent:

- **Warm paper, not gray.** Canvas `#F2ECDF`, raised surfaces `#FCFAF4`, recessed
  `#E9E2D1`. Ink is warm near-black `#221D15`, never pure black, never blue-gray.
- **One accent.** Amber `#AE710F` for text/strokes, butter `#F2C75C` for fills. Amber marks
  exactly four things: the selected-row rail, scheduled times, the "today" calendar cell,
  and the primary `+` button. Nothing else.
- **Atmosphere.** A fixed butter radial glow bottom-right plus an SVG grain overlay, both on
  `.win` pseudo-elements at **`z-index: 1`, beneath the panes** (panes are `z-index: 2` and
  transparent or translucent, so the wash reads through them). Putting these *above* the
  panes breaks every popover — that bug is already fixed in the concept; don't reintroduce it.
- **Type.** Fraunces (`SOFT 40, WONK 1`) for view titles, day headers, item titles and the
  project mark — nothing else. Instrument Sans for all UI. JetBrains Mono for times, counts,
  and metadata. Load from Google Fonts in `index.html`.
- **Native macOS chrome.** Translucent sidebar (`backdrop-filter: blur(24px) saturate(1.4)`),
  0.5px hairline rules, 53px toolbars, real traffic lights, `⌘K` / `⌘N` / `⌘⏎`.
- **Dark theme is warm charcoal** (`#1A160F` family, brown-black). Not blue. Light is the
  hero — build light first, dark second, never ship one untested.
- **Platform mockups are exempt** (when they return — see §1). X is white with `#0F1419`
  text, Instagram is Instagram. Matching the real apps is the point.

---

## 5. Screen structure

Four routes. The window never shows more than three columns.

| View | Columns |
|---|---|
| Queue · List | sidebar `250px` · list `392px` · composer `1fr` |
| Queue · Calendar | sidebar `250px` · month grid `1fr` |
| Library | sidebar `250px` · gallery `1fr` · inspector `296px` |

**Critical CSS detail:** hidden panes use `display: none`, which removes them from the grid
flow. `grid-template-columns` must therefore declare **only the tracks for panes visible in
that view** — not placeholder `0px` tracks. Getting this wrong collapses the calendar into a
sliver. See the `.win[data-view=…]` rules in the concept.

### Sidebar (always present)

1. Traffic lights.
2. **Project switcher** — a popup button showing the current project's mark, name, and
   account count. Popover lists every project, then `All projects`, then `New project…` /
   `Manage projects`. The popover must have an **opaque** background.
3. Search field (`⌘K`).
4. Smart lists: **Queue · Library · Notes & ideas · Drafts · Published**, each with a count.
5. **Accounts**, grouped by platform with a small platform glyph header. Each row: a
   colored initial avatar with a green/gray connection dot, the handle, a small **globe
   icon if `is_global`** (tooltip "Linked to all projects"), and a pending count.
6. `Add account…`
7. Footer: pulsing amber dot + "Next post goes out **in 2h 14m**" (from `next_due`).

Selecting an account filters every view to that account. Selecting a smart list clears it.

### Queue · List

Chronological, grouped under sticky day headers (`Today` / `Tomorrow` / weekday + date).
Row = time (mono, right-aligned) · handle + kind badge · two-line body clamp · media thumb
strip · platform glyph.

Do **not** print a "QUEUED" label on every row — in the Queue everything is queued and it's
noise. Badge only the exceptions, in amber: `Needs a time`, `Failed`.

### Queue · Calendar

Month grid, Monday-start, 7 columns × 6 rows, gap 6px. Cells are rounded warm tiles;
out-of-month cells are transparent. Today gets a 1.5px amber ring. Each cell shows up to two
events (avatar · mono time · truncated title) then `+N more`. Drag an event to another day to
reschedule. Click empty space to compose at that day.

### Composer

- Top strip: `Posting to` + account chips. Selected chips get a 1.5px amber ring. `+ account`
  opens a menu of accounts available in the current project. **This is the multi-account
  payoff — one item, many targets.**
- Title in Fraunces.
- Body as **parts**: a vertical timeline (dot + connector line) with one textarea per part,
  a per-part media tray, and per-part metadata (`2 / 5`, char count) that fades in on hover
  or focus. `Add to thread` appends. A single `post` has exactly one part.
- Dock: schedule pill (amber, opens a date+time picker), character ring, `Save draft`,
  `Schedule` (`⌘⏎`).

No preview toggle in v1 — the mobile preview is deferred.

### Library — tile shape comes from the content

**The rule: a tile's height is determined by what the thing actually is.**

The first pass made every item an identical 4:5 rectangle with a gradient standing in for
an image. That is what made the grid feel dead, and it was also dishonest — a tweet has no
image, a reel is a tall video, an article is a wide link card. Forcing seven different
content types into one rectangle throws away the only visual information the grid has.

Two rules fix it:

1. **Media keeps its real crop.** Reels are 9:16. Carousels and IG posts are 4:5. Images use
   their file's native ratio. Articles lead with a 16:9 hero.
2. **Text-only content is typography, never a fake image.** A tweet, a thread, or a note
   renders as words set in Fraunces on warm paper, sized to its own length. A short post
   makes a short card. Do not generate a placeholder gradient for content that has no media
   — that single decision creates most of the variety on its own.

Layout is **masonry**: a flex row of equal-width columns, each a vertical stack. Items are
packed by placing each into the currently shortest column. Column count is
`clamp(2, floor(containerWidth / 232), 5)`, recomputed in a `ResizeObserver` — the
container has zero width while the pane is `display:none`, so an initial measurement alone
gives the wrong count.

Per-kind treatment — the kind should be legible from the tile's *material*, not just a badge:

| Kind | Shape | Treatment |
|---|---|---|
| `reel` | 9:16 | dark bottom scrim, blurred circular play button, duration pill |
| `carousel` | 4:5 | **two paper edges peeking above the top edge**, like a stack of slides seen front-on, plus an "N slides" pill |
| `image` | native (1:1, 3:4, 3:2) | scrim + caption only |
| `post` / `thread` | fits content | warm paper card, Fraunces ~14px, platform glyph top-right, "N parts" chip for threads |
| `article` | 16:9 hero + text block | hero image over a serif headline and a mono source line — reads as a link card |
| `note` | fits content | warmer paper gradient, amber `IDEA` label, serif body, **no media at all** |

Implementation note for the carousel stack: the peeking edges must be **siblings of the
media frame, not children** — the frame has `overflow: hidden` and will clip them. Give the
tile `position: relative; z-index: 0` so the edges can sit at `z-index: -1` behind the media
without falling behind the page.

Every tile gets the same caption row underneath (account avatar · handle · date) so the
varied shapes still share a baseline rhythm. The handle appears **only** in that caption row,
never also inside the card.

Filter chips across the top with counts: `All / Posts / Threads / Carousels / Reels /
Images / Notes`.

Selecting a tile opens the right-hand inspector: hero, title, then Account / Project /
Status / Goes out / Slides / Created / Folder rows, and `Duplicate` / `Open` at the bottom.

---

## 6. Build order

Each phase must typecheck (`npm run typecheck`) and run (`npm run app:dev`) before the next.

**Phase 0 — Demolition.** Delete everything in §1. Rewrite `src/app/router.tsx` to four
routes. App boots to an empty shell. No `src/v2` references remain anywhere.

**Phase 1 — Data.** Migration `0003`. `accounts.rs`, `schedule.rs`, extended `items.rs` and
`projects.rs`, all registered in `lib.rs`. Typed wrappers in `src/lib/api.ts`. One-time
localStorage→SQLite account import. *Done when:* a seed script can create two projects, five
accounts (two global), and a scheduled thread with three parts and two targets, and every
list command returns it correctly.

**Phase 2 — Design system + shell.** `tokens.css` from the concept. Sidebar with working
project switcher, smart lists, account groups with globe markers, live counts, and the
next-due footer. *Done when:* switching project changes the visible account set, and a global
account appears under every project.

**Phase 3 — Queue list + composer.** The default screen. Real data, sticky day headers, row
selection, multi-target chips, parts editor, schedule pill writing `scheduled_for`.
*Done when:* a thread can be created, targeted at two accounts, scheduled, and reopened
with everything intact after a restart.

**Phase 4 — Calendar.** Month grid, navigation, drag-to-reschedule.

**Phase 5 — Library.** Masonry gallery per §5, filters, search, inspector. *Done when:* a
screenshot of the gallery shows at least four distinct tile silhouettes, and no text-only
item displays a placeholder image.

**Phase 6 — Delivery.** See below.

**Phase 7 — Dark theme.** Warm charcoal. Verify every screen in both themes.

**Deferred — mobile preview.** Not in v1. The phone mockups stay parked per §1.

---

## 7. Delivery — read this before building Phase 6

**Assumption, stated explicitly so it can be overridden:** `Schedule` does **not** call
platform APIs in v1. Real auto-posting needs API keys, a background scheduler, and — for
Instagram and Threads — Meta app review. That is weeks of work on the part most likely to
break, and it blocks everything else.

Build this instead, and it works on day one for every platform:

- A Rust background timer checks `next_due` each minute.
- At the scheduled time it fires a native notification: "Post to @mysocialapp — now".
- Clicking it opens the app to that item with a **Copy post** button that puts the text on
  the clipboard and reveals the images in Finder.
- Marking it done sets `item_targets.status = 'posted'`.

Keep the seam clean: a `Publisher` trait with a `ManualPublisher` implementation. Real API
publishers slot in behind it later, per platform. **X is the only platform worth doing first**
— it has a usable free write tier. Do not start Meta integration until asked.

---

## 8. Acceptance — the app is done when

1. Three projects exist. Switching between them changes content and the account list.
2. An account marked global appears under every project; a scoped one appears under exactly
   the projects it's linked to.
3. One thread with five parts and images on part 1 posts to two accounts on two platforms,
   scheduled for a specific date **and time**.
4. Queue, Calendar and Library all show that item, and all three agree.
5. A note can be captured in three keystrokes and converted into a scheduled post.
6. Quitting and reopening loses nothing.
7. No screen shows four columns.
8. In the Library, a reel, a carousel, a tweet, an article and a note are each
   distinguishable **by silhouette alone**, with the sidebar covered up.
9. Every screen is correct in light and dark.
