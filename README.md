# Distribution OS

A local-first, multi-project content & distribution command center for a solo founder.
The **content knowledge base is the foundation**; publishing, analytics, launch
tracking, and attribution are modules that layer on top.

See [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md) for the full roadmap.

## Status

**Phase 0 (Scaffold) + Phase 1 (Content Knowledge Base)** — shipped.

You can already:
- Capture **core ideas** (title, thesis, tags, status), scoped per project.
- Spin **platform variants** (Threads / X / Instagram / generic) off one idea, each
  with its own body, kind, status workflow, and character count.
- Attach **assets** (images/documents) — copied into the app data dir, referenced by path.
- **Full-text search** across ideas and variants (SQLite FTS5).
- Projects seeded: **Validate (A)**, **Project B**, **Project C**, **Personal**.

Everything else (OAuth, publishing, analytics, launch, attribution) is scaffolded
in the schema and navigation, and gets wired up in later phases.

## Stack

- **Tauri v2** desktop shell (macOS first)
- **React + Vite + TypeScript** UI (`src/`)
- **Rust core** with **SQLite** via `rusqlite` (bundled, FTS5) — `src-tauri/`
- Cloud-ready schema: UUID PKs, `created_at`/`updated_at`/`deleted_at`, `sync_status`

## Develop

```bash
npm install          # once
npm run app:dev      # launch the Tauri desktop app (Vite + Rust)
```

Other useful scripts:

```bash
npm run typecheck    # tsc --noEmit
npm run dev          # Vite only (UI in a browser, no Tauri APIs)
npm run app:build    # bundle the desktop app
```

Rust-only check:

```bash
cd src-tauri && cargo check
```

## Where things live

```
src/
  app/            router, shell, project context
  features/kb/    knowledge base (ideas, variants, assets, search)
  lib/api.ts      typed wrappers over Tauri commands
src-tauri/src/
  lib.rs          app bootstrap + command registration
  db/             SQLite: schema, CRUD commands, FTS search
    migrations/0001_init.sql
```

Data lives in the OS app-data dir (`distribution-os.sqlite3` + `assets/`), not in
the repo.

## The hosted app (Cloudflare Worker)

The desktop app above still works and is unchanged. Alongside it, the same
`src/` frontend deploys to a Cloudflare Worker that adds Instagram OAuth,
media staging and scheduled publishing.

```
worker/
  index.ts          router + the safety-net cron handler
  scheduler.ts      AccountScheduler — the Durable Object that holds the timer
  lib/              env, crypto, signing, auth, db, r2, instagram
  routes/           instagram-auth, media, publish, accounts
db/schema.sql       D1 (SQLite) schema
wrangler.jsonc      bindings: D1, R2, the Durable Object, static assets
```

Scheduling is a **durable timer, not a poll**: `setAlarm()` writes a timestamp
and the object is evicted, so a post three weeks out is a stored date rather
than anything running. Each alarm advances one target one step and re-arms —
Durable Objects bill wall-clock time while active, so nothing ever waits in a
loop. See HANDOFF.md for the full reasoning and the free-tier budget.

```bash
npm test             # vitest, inside the Workers runtime
npm run typecheck    # frontend and worker
npm run worker:dev   # wrangler dev
```

Not yet deployed: this needs a domain, a Cloudflare account, a D1 database, an
R2 bucket and a Meta app. Steps 5–10 of HANDOFF.md cover that.
