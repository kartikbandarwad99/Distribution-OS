# Codex prompt — make Distribution OS a working app

Paste everything below the line into Codex, from the repo root.

---

You are working on **Distribution OS**, a local-first Tauri v2 + React 18 + TypeScript desktop app
for scheduling and analysing content across eleven social accounts on five platforms.

A previous pass produced the visual design correctly but **failed to produce a working
application**. Your job is to fix that. Read this whole brief before writing any code.

---

# PART 0 — The mistake you must not repeat

`public/concept-v5.html` is a static HTML mock. It exists to show **what the app should look
like**. It is a picture of an app, not an app.

The previous pass treated it as a thing to clone, and produced a faithful, beautiful, **dead**
interface: you cannot scroll it, you cannot create a post, you cannot type a single character
anywhere, and there is no settings screen. It reproduced the mock's limitations along with its
appearance.

**The mock defines the look. This brief defines the behaviour. Where they conflict, behaviour
wins.** If making something work requires a control the mock does not show — a modal, a form
field, an empty state, a confirm dialog, a scrollbar — build it, styled to match the mock's
system. You are not being graded on fidelity to a screenshot. You are being graded on whether a
person can sit down and run their content operation in this app.

---

# PART 1 — Hard rules

### 1.1 Write normal, readable code. This is non-negotiable.

The previous pass minified everything. Actual current state of the repo:

| File | Chars | Lines |
|---|---|---|
| `src/features/analytics/AnalyticsView.tsx` | 7,170 | **11** |
| `src/features/plan/PlanView.tsx` | 5,762 | **11** |
| `src/features/articles/ArticlesView.tsx` | 5,239 | **7** |
| `src/features/assets/AssetsView.tsx` | 2,321 | **3** |
| `src/styles/app.css` | 20,437 | **11** |
| `src/lib/charts.ts` | 730 | **2** |

This is unacceptable and is the root cause of every other problem — code written this way cannot
be reviewed, debugged, or extended, including by you on the next pass.

Required:
- **One statement per line.** Line length under ~110 chars.
- Real line breaks in JSX. One prop per line when a tag has more than three.
- Blank lines between logical blocks. Named functions, not chains of ternaries.
- CSS: one selector per line minimum, one declaration per line for any rule with 3+ declarations.
- No `const x=a?b:c,y=d?e:f` compound declarations. No single-letter names except loop indices.
- Every exported function gets a one-line comment saying what it does and why it exists.

**Self-check before you finish:** run
`find src -name "*.tsx" -o -name "*.ts" -o -name "*.css" | xargs awk '{ if (length($0) > 140) print FILENAME": "FNR" ("length($0)" chars)" }'`
It currently prints **106 offending lines**. When you are done it must print nothing.

### 1.2 Stack constraints

React 18, react-router-dom v6, Vite 6, Tauri v2, plain CSS. **Do not add dependencies.** No UI
library, no chart library, no CSS framework, no state library. Charts are hand-written SVG.

`npm run typecheck` must pass clean. No `any` except where genuinely unavoidable, and comment it.

### 1.3 Do not delete work

`src/features/queue/Composer.tsx` (530 lines) and `src/features/settings/SettingsView.tsx` (192
lines) are **fully written and currently orphaned** — zero imports, not in the router. So are
`QueueView.tsx`, `CalendarView.tsx`, `LibraryView.tsx`, `PreviewRail.tsx`, `Inspector.tsx`.

Do not delete them. **Wire them in.** Restyle them to the v5 token system. Every text input and
textarea in this entire application currently lives in one of these dead files — which is
precisely why the app has no way to enter content.

---

# PART 2 — What is broken right now

Fix all of these. They are specific and verified.

### 2.1 The app does not scroll

`src/styles/app.css` sets `body { overflow: hidden }` — correct for a desktop shell — but the
height chain below it does not propagate, so overflowing content is clipped and unreachable
rather than scrollable.

- `.app` is `height:100%; display:grid; grid-template-columns:...` with **no `grid-template-rows`**,
  so its single implicit row is auto-sized and grows past the viewport.
- `.main` has `grid-template-rows: auto minmax(0,1fr)` but no `min-height: 0`, so it will not
  shrink below its content.
- `.page { overflow: hidden }` and `.scroll { overflow: auto }` are applied to the same elements
  in four views, which is confused. `PlanView` uses neither and has no scroll container at all —
  and Plan is the landing route, which is why the app appears completely frozen on open.

**The layout contract, apply it everywhere:**

```
body            overflow: hidden          (the window never scrolls)
.app            height: 100%; display: grid;
                grid-template-columns: var(--side-w) minmax(0, 1fr);
                grid-template-rows: 100%;
.main           min-width: 0; min-height: 0; display: grid;
                grid-template-rows: auto minmax(0, 1fr);
.bar            (row 1, fixed height, never scrolls)
.scroll         (row 2) overflow-y: auto; min-height: 0;
```

Every route's root must be `.bar` + a `.scroll` region. `.page` should be deleted or merged into
`.scroll` — do not apply both to one element. Any nested scroller (the kanban board's horizontal
scroll, the sidebar's channel rail, a drawer body, an inspector rail) needs its own
`min-height: 0` on every flex/grid ancestor between it and the viewport, or it will not scroll.

**Verify:** every one of the five routes, plus the one-channel and long-room sub-views, must
scroll to the bottom of their content at an 800px-tall window. Check each one.

### 2.2 There is no way to create anything

`New`, `+ New piece`, and `Add a piece` render as markup with no `onClick`. There are **zero**
`<input>` or `<textarea>` elements in any of the five v5 views. The app is read-only.

### 2.3 There is no settings screen

`SettingsView.tsx` exists and is not routed. The sidebar has no way to reach it.

### 2.4 Nothing persists

Reload returns everything to the seed data. The only state mutation in the whole app is the
kanban drag handler moving a card between columns, and even that is lost on refresh.

---

# PART 3 — The data layer

Build this first; every screen depends on it.

### 3.1 A real store

Create `src/lib/store.ts`: a typed store over the app's entities, exposed through a React context
(`useStore()`), with **create / update / delete** for each. Not just reads.

Entities: `Project`, `Channel` (the eleven accounts), `PlanItem`, `Article`, `Asset`,
`LibraryItem`, `Post` (published, with metrics), `Settings`.

```ts
interface Store {
  projects: Project[];
  channels: Channel[];
  planItems: PlanItem[];
  articles: Article[];
  assets: Asset[];
  posts: Post[];
  settings: Settings;

  createPlanItem(draft: NewPlanItem): PlanItem;
  updatePlanItem(id: string, patch: Partial<PlanItem>): void;
  deletePlanItem(id: string): void;
  movePlanItem(id: string, col: PlanCol, index?: number): void;
  schedulePlanItem(id: string, iso: string): void;
  unschedulePlanItem(id: string): void;
  duplicatePlanItem(id: string): PlanItem;
  // …the same shape for articles and assets
}
```

### 3.2 Persistence

Persist the whole store to `localStorage` under one key, debounced ~400ms, and rehydrate on
boot. Version the payload (`{ version: 1, data: … }`) and fall back to seed data if the version
does not match.

This is deliberately a stopgap so the UI can be built and used today. Isolate it behind a single
`persist()` / `hydrate()` pair in `store.ts` so swapping in Tauri + SQLite later touches one file
and no components. Do not scatter `localStorage` calls through the views.

### 3.3 Seed data

Port the mock data from `public/concept-v5.html` into `src/lib/seed.ts`, including the seeded
random-walk generator (`seeded()` / `walk()`) for the 90-day per-channel series — reproducible
plots, not hard-coded arrays. Every channel keeps its `tint` hex; that value is the channel's
identity token across the entire UI.

### 3.4 Dates are real dates

Store scheduled times as ISO strings, not display strings like `"Today · 09:30"`. `Today`,
`Mon 28 · 09:00` and the calendar's cell placement must all be *derived* from a real timestamp
via `src/lib/dates.ts`. The calendar must be able to page to the previous and next month and
show the correct items; it currently hard-codes July 2026.

---

# PART 4 — What must actually work

This is the acceptance spec. Each line is a thing a user does.

### 4.1 Create a piece — the central flow

A **Composer** opens as a centred modal over a scrim from *all* of these entry points:

- `New` in the Plan bar
- `+ Add` at the foot of any kanban column (pre-fills that column)
- Clicking an empty calendar day (pre-fills that date)
- `+` in a channel lane cell (pre-fills that channel *and* that date)
- `New for this channel` on the one-channel analytics page (pre-fills the channel)
- `Make a post from this` in the Assets inspector (pre-attaches the asset)
- `⌘N` from anywhere

Reuse and restyle `src/features/queue/Composer.tsx`. It must contain:

- A **body textarea** that autosizes, with a live character count against the target platform's
  limit, turning rubric red past the limit.
- **Channel picker** — multi-select across the eleven channels, each showing its tint swatch and
  platform glyph. Selecting two or more turns the piece into a multi-destination post and shows
  one preview tab per destination.
- **Kind** — post / thread / carousel / reel / image / article. Choosing `thread` reveals an
  add-a-part control; choosing `carousel` or `reel` requires at least one asset.
- **Asset attachment** — opens an asset picker over the existing Assets grid; attached assets show
  as removable thumbnails.
- **Schedule** — a date + time control, plus `Save as draft` (no time) and a
  `Best time: 09:30` suggestion taken from the selected channel's `best` field.
- Footer: `Cancel` · `Save draft` · `Schedule` (primary, `⌘↵`).

On save the store gains a real item and **every view updates**: the kanban column, the calendar
cell, the channel lane, the sidebar queued count, and the analytics cadence bar.

Editing an existing piece opens the same Composer pre-filled, with `Delete` in the footer behind
a confirm.

### 4.2 Plan

- Kanban ⇄ Calendar toggle persists to the URL (`/plan?view=kanban`), survives reload.
- **Drag a card between columns** and it persists. Dropping into `Scheduled` with no time set
  opens the time picker rather than silently accepting an invalid state. Dragging *out* of
  `Scheduled` keeps the timestamp but greys it, and the card shows `time kept — not scheduled`;
  it is not discarded.
- Cards reorder within a column by drag.
- Calendar: **drag a chip from one day to another to reschedule**, preserving the time of day.
- Calendar pages between months; `Today` returns.
- Clicking a day opens the drawer; the drawer's rows are clickable into the Composer; the drawer
  has an `Add on this day` button; `Esc` closes it.
- Both filter rails filter live, and the filter persists across the kanban/calendar toggle.
- Channel lanes: clicking an empty cell creates on that channel + day.

### 4.3 Articles

- `New article` creates a draft and opens the long room immediately.
- The long room's title and body are **editable** — a real `contentEditable` or textarea surface
  that writes back to the store on blur, with a `Saved` indicator. Word count and read time
  recompute live.
- Outline items check and uncheck; `Add a section` appends one; progress recomputes.
- Destinations add and remove.
- `Schedule` opens a date/time picker and moves the article to `scheduled`.
- **Published articles are read-only** — banner, no editable surfaces, `Duplicate to edit` creates
  a new draft copy and opens it.
- Status filter chips actually filter.

### 4.4 Assets

- **Import** opens a file picker (Tauri dialog plugin is already a dependency; fall back to a
  hidden `<input type="file">` in the browser) and adds real entries with object-URL thumbnails.
- Select an asset → inspector populates. Multi-select with shift.
- Rename an asset inline. Add and remove tags. Move to a folder. Delete behind a confirm.
- Folder chips filter; `Unused` and `Earned` sorts work.
- `Make a post from this` opens the Composer with the asset attached.

### 4.5 Library

- Filter chips and the search field both filter live.
- `Grid` / `By reach` re-sorts.
- Clicking a tile opens a detail view with its metrics and a `Post again` action that opens the
  Composer pre-filled with the original body.

### 4.6 Analytics

- Range (7/30/90) and Over-time/Cumulative toggles recompute every chart and every total.
- Both filter rails work; totals recompute against the active filter.
- Clicking a channel card **or** a channel in the sidebar rail opens the one-channel page.
- One-channel: `Top` / `All posts` toggle, and the post table sorts by clicking any metric header.
- Back navigation works, including the browser/keyboard back gesture.

### 4.7 Settings — build the screen

Route it at `/settings`, reachable from a gear at the foot of the sidebar next to the next-out
pulse. Restyle the existing `SettingsView.tsx` into the v5 system. It needs:

- **Channels** — the eleven accounts as a table: connect / reconnect / disconnect, edit handle,
  set the posting-cadence target, **edit the channel's tint via a colour swatch**, set the best
  hour, remove the channel. Reconnecting an account in `reauth` state clears its warning
  everywhere in the app.
- **Projects** — create, rename, recolour, delete; assign channels to a project or to
  `Everywhere`. The sidebar project switcher must actually switch, and switching must re-scope
  every screen.
- **Publishing** — auto-publish vs. notify-me per platform, with an explanation of why Instagram
  and Threads default to notify-me (Meta app review). Default reminder lead time.
- **Appearance** — the existing ThemeContext is already there; expose light/dark and the base
  font size.
- **Data** — export the store as JSON, import it back, and `Reset to seed data` behind a
  type-to-confirm.

### 4.8 Global

- `⌘K` opens a command palette that searches across pieces, articles, assets and channels, and
  jumps to them.
- `⌘N` new piece. `1`–`5` route switching (already works — keep it). `Esc` closes the topmost
  layer.
- Sidebar search filters the channel rail.
- **Every empty state is designed**: an empty kanban column, a month with nothing scheduled, a
  channel with no posts, no search results, zero assets. Each says what it is and offers the
  action that fills it. The mock does not show these; you must invent them, in its idiom.
- Destructive actions confirm. Deletes offer an undo toast for ~6 seconds.
- Buttons that do nothing must not exist. If you cannot make a control work, remove it rather
  than shipping dead chrome.

---

# PART 5 — Design

The visual system is **already correct and already landed** in `src/styles/tokens.css` and
`src/styles/app.css`. Keep it. Do not redesign. Reformat `app.css` per rule 1.1, split it into
per-feature files if it helps, but do not change the values.

Recap of what must stay true, all of it visible in `public/concept-v5.html`:

- Paper `#f7f6f3`, panels white, sidebar `#f2f1ec`, ink `#23252b`, hairline rules at 9%/16%.
- Rubric `#a3271e` is rubrication — it marks and numbers (the `¶`, a scheduled time, today's
  cell, a drop cap, a caret). It is never a button fill, never a chart series.
- EB Garamond for reading matter and large numerals (old-style figures), Public Sans for all
  chrome, Azeret Mono for anything that has to line up (tabular).
- Radius 7px controls / 11px panels; the two-layer soft `--lift` and `--pop` shadows; hover
  transitions at `.19s cubic-bezier(.32,.72,.28,1)`; cards lift 1–2px and nothing bounces.
- **Channel tint** — each channel's hex applied as `style={{ ['--ch' as any]: channel.tint }}`,
  showing up as an 8% wash plus a 2px inset rail on calendar chips, a 3px left rail on kanban
  cards, a 3px top rail on analytics cards, the lane label background, and the drawer row. Always
  paired with the platform glyph so it never depends on colour alone.
- **Charts** — Fritsch–Carlson monotone cubic (`smooth()` in `src/lib/charts.ts`; monotone
  specifically, because Catmull-Rom overshoots and would invent reach that never happened).
  1.7px round-capped strokes, a 20%→0 gradient fill on the lead series only, four hairline
  gridlines at 7% ink, no axes or ticks, a ringed dot on the last point, 9px mono labels.

New surfaces you build — Composer, settings, pickers, empty states, palette, toasts — inherit all
of the above. A modal is a white `--r-l` panel with `--pop` over a `rgb(28 28 32 / .22)` scrim.

---

# PART 6 — Order of work

1. `store.ts` + `seed.ts` + persistence, with the store wired into `main.tsx`. Nothing else until
   this is real.
2. The layout/scroll contract from §2.1, verified on all five routes.
3. Composer, wired to `createPlanItem`, reachable from the Plan bar. This is the app's spine —
   get it working before anything else gets polished.
4. Plan: drag persistence, calendar rescheduling, day drawer, month paging.
5. Settings, routed and reachable.
6. Articles editing and the read-only rule.
7. Assets import, tagging, selection.
8. Analytics interactions, Library filtering.
9. Command palette, empty states, undo toasts.

Commit after each numbered step so the work is reviewable.

---

# PART 7 — Acceptance check

Run `npm run dev` and confirm each of these yourself. Report the result of every line; if one
fails, fix it rather than reporting it as done.

```
[ ] awk long-line check (§1.1) prints nothing
[ ] npm run typecheck passes clean
[ ] All 5 routes + one-channel + long room scroll to the bottom at an 800px-tall window
[ ] ⌘N opens the Composer; typing a body, picking @validate.app, picking a time and
    hitting Schedule creates a card that appears in the Scheduled column
[ ] …that same piece appears on the right calendar day, in the right channel lane,
    and increments the sidebar queued count for that channel
[ ] Reloading the app keeps it
[ ] Dragging it to Ready removes the schedule and keeps the timestamp greyed
[ ] Deleting it offers an undo toast, and undo restores it
[ ] Clicking a calendar day opens the drawer; Esc closes it
[ ] Calendar pages to August and back to July with Today
[ ] Settings is reachable from the sidebar, changes a channel's tint, and that tint
    updates the kanban card, calendar chip and analytics tile immediately
[ ] Switching project in the sidebar re-scopes Plan, Library and Analytics
[ ] New article opens the long room; typing in it and reloading keeps the text
[ ] A published article shows the read-only banner and cannot be edited
[ ] Duplicate to edit produces an editable draft copy
[ ] Assets import adds a real file with a thumbnail; renaming and tagging persist
[ ] Analytics range and cumulative toggles change every chart and every total
[ ] Clicking a channel opens its page; the post table sorts by clicking a metric header
[ ] ⌘K finds a piece by its text and jumps to it
[ ] Every empty state renders something designed, never a blank panel
[ ] No button in the app does nothing when clicked
```
