# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Distribution OS ships as a **Tauri v2 desktop app, macOS first**. The UI is web
technology, so the platform value is `web` — but the design language is not. It must read
as a native Mac application: real traffic lights, translucent chrome, hairline rules,
system-weight toolbars, and the keyboard reflexes a Mac user already has. A web-shaped app
in a native window is a failure condition here, not a shortcut.

## Users

One person: a solo founder running several products at once, on a Mac, writing and
scheduling their own social content. They already know the domain and the data model —
they built it. They work fast, keyboard-first, and switch between products many times a
day.

Not a team. There is no collaboration layer, no roles, no permissions, no second seat.

Built for the owner now, but with the intent to open it to other solo founders later.
First-run, onboarding, and empty states should stay legible enough that opening it up
later is a design decision rather than a rewrite — but they should not be over-built for
users who do not exist yet.

## Product Purpose

Give one person a calm, local-first command center for everything they publish across
several products and several social accounts.

They write posts, threads, carousels and reels; target each at one or more accounts; put
them on a timeline; and browse everything they have ever made in one place. Success is
that the owner stops keeping the schedule in their head and stops paying a SaaS to hold
it for them.

## Positioning

Three claims a neighboring product could not truthfully copy:

1. **Multi-account is first-class, not an upsell.** Two X accounts, two Instagram
   accounts, a LinkedIn — all visible at once, all targetable from one composer.
2. **Projects scope everything, and accounts can be project-scoped *or* global.** A
   personal handle appears under every product; a product's handle appears only under it.
   The query that defines the product is "which accounts are visible in project P."
3. **Local-first, genuinely.** SQLite on disk, no server, no account, no sync, no
   telemetry. The app works with the network off.

## Operating Context

- macOS desktop, one window, one person, used in short bursts many times a day.
- Multiple products run in parallel; the project switcher is used constantly.
- **Never more than three columns on screen.** This is the constraint that keeps the app
  calm, and it is binding on every layout decision.
- Four routes: Queue (list), Queue (calendar), Library, Settings.
  - Queue · List — sidebar 250px · list 392px · composer 1fr
  - Queue · Calendar — sidebar 250px · month grid 1fr
  - Library — sidebar 250px · gallery 1fr · inspector 296px
- The sidebar is always present: traffic lights, project switcher, search (⌘K), smart
  lists with counts, accounts grouped by platform, and a next-due footer.
- Keyboard: ⌘K search, ⌘N new draft, ⌘⏎ schedule.

## Capabilities and Constraints

**Vocabulary — use these exact strings.**

| Field | Values |
|---|---|
| `accounts.platform` | `x` · `instagram` · `threads` · `linkedin` |
| `content_items.kind` | `post` · `thread` · `carousel` · `reel` · `image` · `article` · `note` |
| `content_items.status` | `idea` · `draft` · `scheduled` · `published` · `failed` |
| `item_targets.status` | `queued` · `posted` · `failed` · `skipped` |

**Confirmed functionality.**

- One item targets many accounts (`item_targets`).
- Threads and carousels are ordered `item_parts`; a plain post has exactly one part.
- A note is not a separate type — it is `kind='note'`, `status='idea'`, no targets, no
  scheduled time, rendered by the same rows and the same editor as everything else. There
  is no second editor and no todo system.
- Scheduling uses a real local timestamp (`scheduled_for` + IANA `timezone`). The legacy
  date-only `scheduled_at` is dead and must not be read.

**Delivery is manual in v1, by decision.** `Schedule` does not call platform APIs. A Rust
background timer fires a native notification at the scheduled minute; clicking it opens
the item with a Copy post button and reveals the images in Finder; marking it done sets
the target status. A `Publisher` trait keeps the seam clean for real API publishers later.
X is the only platform worth automating first.

**Non-goals — do not build.** A team/collaboration layer, a Notion clone, an analytics
dashboard, an AI caption generator, a separate task manager, cloud sync, or a web version.

**Deferred.** The phone preview mockups (X / Instagram / Threads profile renders) are out
of scope for v1 and parked on disk unreferenced.

**Undecided.** Whether the content knowledge base described in the older README returns as
a real module. Treat it as not part of the product until decided.

## Brand Commitments

- The product is named **Distribution OS**. That name appears in the app chrome.
- Platform mockups, when they return, stay true to the real platforms — X is white with
  `#0F1419` text, Instagram is Instagram. They never take the app's palette. "Pixel
  accurate" means matching the real apps, and that is the point of them.

## Evidence on Hand

- `BUILD_SPEC.md` — the current and authoritative product + build brief. Confirmed by the
  user as source of truth over `README.md`, which is stale (it describes an abandoned
  "ideas → platform variants → knowledge base" framing).
- `public/concept-v4.html` — the incumbent visual world, 862 lines, self-contained.
  `public/concept-v3.html` is its predecessor.
- `src/styles/tokens.css` — the incumbent token set, copied from concept-v4.
- Working React implementation in `src/` for all four routes.
- The Rust/SQLite core in `src-tauri/`.

There are no customers, no testimonials, no benchmarks, no pricing, and no press. Future
work must not fabricate any.

## Product Principles

1. **Calm over capacity.** Three columns, one accent, no dashboard energy. When a feature
   and calmness conflict, calmness wins.
2. **The data model is the product.** Projects × accounts × targets is the mechanism;
   every screen should make that structure visible rather than hide it behind wizards.
3. **Local-first is a promise, not a stack detail.** Nothing designed may imply a server,
   an account, a sync state, or a network dependency.
4. **Native Mac, not web-in-a-window.** Match the platform's chrome, density, and keyboard
   expectations before expressing anything else.
5. **Shape carries meaning.** A tweet is not a rectangle with a gradient in it. Content
   types should be legible from their material and proportion, not from a badge.
