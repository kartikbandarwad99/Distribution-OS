/*
 * Browser stand-in for the Rust backend.
 *
 * `npm run dev` opens the app in a plain browser, where `invoke` has nothing to
 * talk to. This module answers the same commands against a localStorage blob
 * shaped like the SQLite schema, seeded with the same demo content as
 * `db/seed.rs`, so the UI can be built and inspected without booting Tauri.
 * It is never used inside the app itself.
 */

interface Row {
  [k: string]: any;
}

interface Db {
  projects: Row[];
  accounts: Row[];
  account_projects: { account_id: string; project_id: string }[];
  items: Row[];
  parts: Row[];
  targets: Row[];
  assets: Row[];
  folders: Row[];
}

const KEY = "mysocial.mockdb.v1";
const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const now = () => new Date().toISOString();

let db: Db | null = null;

function load(): Db {
  if (db) return db;
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      db = JSON.parse(raw) as Db;
      return db;
    } catch {
      /* fall through and reseed */
    }
  }
  db = seed();
  save();
  return db;
}

function save() {
  if (db) localStorage.setItem(KEY, JSON.stringify(db));
}

/** Local wall-clock stamp, 'YYYY-MM-DDTHH:MM:SS' — the same format Rust writes. */
function stamp(dayOffset: number, h: number, m: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:00`;
}

// Seed

function seed(): Db {
  const ts = now();
  const project = (name: string, description: string, personal = false) => ({
    id: uid(),
    name,
    description,
    website: null,
    logo_path: null,
    is_personal: personal,
    created_at: ts,
    updated_at: ts,
    deleted_at: null,
  });
  const mysocial = project("mysocial", "The scheduler itself");
  const fretbase = project("Fretbase", "Guitar practice app");
  const personal = project("Personal brand", "Founder presence", true);

  const d: Db = {
    projects: [mysocial, fretbase, personal],
    accounts: [],
    account_projects: [],
    items: [],
    parts: [],
    targets: [],
    assets: [],
    folders: [],
  };

  const account = (
    platform: string,
    handle: string,
    display_name: string,
    is_global: boolean,
    connected: boolean,
    projects: string[],
    order_index = 0,
  ) => {
    const a = {
      id: uid(),
      platform,
      handle,
      display_name,
      avatar_path: null,
      is_global,
      connection_status: connected ? "connected" : "manual",
      order_index,
      created_at: ts,
      updated_at: ts,
      deleted_at: null,
    };
    d.accounts.push(a);
    for (const p of projects)
      d.account_projects.push({ account_id: a.id, project_id: p });
    return a.id;
  };

  const xApp = account(
    "x",
    "@mysocialapp",
    "mysocial",
    false,
    true,
    [mysocial.id],
    0,
  );
  const xMe = account("x", "@kartikbuilds", "Kartik", true, true, [], 1);
  const igApp = account(
    "instagram",
    "@mysocial.app",
    "mysocial",
    false,
    true,
    [mysocial.id],
    0,
  );
  const igFret = account(
    "instagram",
    "@fretbase",
    "Fretbase",
    false,
    true,
    [fretbase.id],
    1,
  );
  const thMe = account("threads", "@kartikbuilds", "Kartik", true, true, [], 0);
  const liMe = account(
    "linkedin",
    "Kartik Bandarwad",
    "Kartik Bandarwad",
    false,
    false,
    [personal.id],
    0,
  );

  let assetSeed = 20;
  const item = (o: {
    project: string;
    title: string;
    kind: string;
    status: string;
    when: [number, number, number] | null;
    parts: string[];
    targets: string[];
    media?: number;
  }) => {
    const id = uid();
    const created = new Date();
    created.setDate(created.getDate() - Math.floor(Math.random() * 20));
    d.items.push({
      id,
      project_id: o.project,
      folder_id: null,
      title: o.title,
      kind: o.kind,
      body: o.parts[0] ?? "",
      status: o.status,
      scheduled_for: o.when ? stamp(...o.when) : null,
      timezone: "Asia/Kolkata",
      order_index: 0,
      created_at: created.toISOString(),
      updated_at: ts,
      deleted_at: null,
    });
    o.parts.forEach((body, i) =>
      d.parts.push({
        id: uid(),
        item_id: id,
        order_index: i,
        body,
        created_at: ts,
        updated_at: ts,
      }),
    );
    o.targets.forEach((account_id) =>
      d.targets.push({
        id: uid(),
        item_id: id,
        account_id,
        status: o.status === "published" ? "posted" : "queued",
        posted_at: null,
        external_url: null,
        error: null,
      }),
    );
    for (let i = 0; i < (o.media ?? 0); i++) {
      d.assets.push({
        id: uid(),
        item_id: id,
        part_id: null,
        // Resolved to a stable picsum image by resolveAssetUrl in the browser.
        file_path: `assets/demo-${assetSeed++}.jpg`,
        order_index: i,
        alt_text: null,
        deleted_at: null,
      });
    }
    return id;
  };

  item({
    project: mysocial.id,
    title: "Local-first launch thread",
    kind: "thread",
    status: "scheduled",
    when: [0, 11, 30],
    parts: [
      "Most schedulers are built for teams of 30.\n\n" +
        "I built one for a team of one — it runs on my Mac, stores nothing in the cloud, " +
        "and costs $0/mo.\n\nHere's how it works →",
      "1. Everything lives in one SQLite file on disk. No account, no sync, no server that can shut down.",
      "2. Multiple accounts per platform, because I run a product handle and a personal one and I'm tired of logging out.",
    ],
    targets: [xApp, thMe],
    media: 4,
  });
  item({
    project: mysocial.id,
    title: "7 things I got wrong building a Mac app in Tauri",
    kind: "carousel",
    status: "scheduled",
    when: [0, 18, 0],
    parts: [
      "7 things I got wrong building a native Mac app in Tauri — swipe for the ones that cost me a weekend.",
      "1. I reached for a web router before I knew what the windows were.",
      "2. HTML5 drag and drop fights the native file-drop layer. Pointer events don't.",
    ],
    targets: [igApp],
    media: 7,
  });
  item({
    project: personal.id,
    title: "Saturday shipping",
    kind: "post",
    status: "scheduled",
    when: [0, 21, 15],
    parts: [
      "shipping something small every saturday is the only consistency hack that has ever worked for me",
    ],
    targets: [thMe],
  });
  item({
    project: mysocial.id,
    title: "Local-first means…",
    kind: "post",
    status: "scheduled",
    when: [1, 9, 0],
    parts: [
      "Local-first means your drafts survive the company that made the app. " +
        "Screenshot of the SQLite file, because that's the whole backend.",
    ],
    targets: [xApp],
    media: 1,
  });
  item({
    project: personal.id,
    title: "Why I stopped paying $49/mo for a social scheduler",
    kind: "article",
    status: "draft",
    when: null,
    parts: [
      "Why I stopped paying $49/mo for a social scheduler and spent three weekends instead…",
    ],
    targets: [liMe],
    media: 1,
  });
  item({
    project: personal.id,
    title: "Week 12 in public",
    kind: "post",
    status: "scheduled",
    when: [2, 8, 30],
    parts: [
      "week 12 of building in public. revenue: $0. lessons: several. still going.",
    ],
    targets: [xMe],
  });
  item({
    project: mysocial.id,
    title: "Idea → scheduled in four keystrokes",
    kind: "reel",
    status: "scheduled",
    when: [2, 19, 0],
    parts: [
      "30-second screen recording: idea → scheduled post in four keystrokes.",
    ],
    targets: [igApp],
    media: 1,
  });
  item({
    project: mysocial.id,
    title: "Pricing page teardown",
    kind: "carousel",
    status: "scheduled",
    when: [4, 12, 30],
    parts: [
      "Pricing page teardown: why I charge nothing (for now) and what that buys me.",
    ],
    targets: [igApp],
    media: 5,
  });
  item({
    project: mysocial.id,
    title: "Drafts and the SaaS graveyard",
    kind: "note",
    status: "idea",
    when: null,
    parts: [
      "Angle worth testing: nobody talks about what happens to your drafts when the SaaS shuts down. Lead with the SQLite file.",
    ],
    targets: [],
  });
  item({
    project: mysocial.id,
    title: "Record the demo",
    kind: "note",
    status: "idea",
    when: null,
    parts: [
      "- [ ] record the 30s demo before Friday\n- [ ] clean desktop\n- [ ] fake dataset that looks real",
    ],
    targets: [],
  });
  item({
    project: personal.id,
    title: "Week 13 in public",
    kind: "thread",
    status: "draft",
    when: null,
    parts: [
      "week 13. shipped the calendar, broke the composer twice, learned what a masonry column is.",
      "the drag-to-reschedule took four hours and thirty of those minutes were the actual drag.",
    ],
    targets: [xMe],
  });
  item({
    project: fretbase.id,
    title: "Fretboard drill of the week",
    kind: "reel",
    status: "scheduled",
    when: [3, 17, 0],
    parts: [
      "One drill, five positions, ninety seconds. Save this for your next practice session.",
    ],
    targets: [igFret],
    media: 1,
  });
  item({
    project: fretbase.id,
    title: "Three months of building, in screenshots",
    kind: "carousel",
    status: "published",
    when: [-6, 12, 0],
    parts: [
      "Three months of building, in screenshots. The first one is embarrassing.",
    ],
    targets: [igFret],
    media: 4,
  });
  item({
    project: mysocial.id,
    title: "App icon exploration, round 3",
    kind: "image",
    status: "published",
    when: [-9, 10, 0],
    parts: [
      "App icon exploration, round 3. Warmer, and the paper texture finally survived export.",
    ],
    targets: [igApp],
    media: 1,
  });
  item({
    project: mysocial.id,
    title: "Month wrap",
    kind: "post",
    status: "scheduled",
    when: [6, 16, 0],
    parts: ["month wrap: 14 posts, 2 platforms, 0 servers."],
    targets: [xApp, xMe],
  });
  return d;
}

// Projections

const live = <T extends Row>(rows: T[]) => rows.filter((r) => !r.deleted_at);

function accountRow(a: Row): Row {
  const d = load();
  return {
    ...a,
    project_ids: d.account_projects
      .filter((ap) => ap.account_id === a.id)
      .map((ap) => ap.project_id),
    pending_count: d.targets.filter(
      (t) =>
        t.account_id === a.id &&
        t.status === "queued" &&
        live(d.items).some((i) => i.id === t.item_id),
    ).length,
  };
}

function targetsOf(itemId: string) {
  const d = load();
  return d.targets
    .filter((t) => t.item_id === itemId)
    .map((t) => {
      const a = d.accounts.find((x) => x.id === t.account_id);
      return a
        ? {
            account_id: t.account_id,
            handle: a.handle,
            display_name: a.display_name,
            platform: a.platform,
            status: t.status,
            posted_at: t.posted_at,
            external_url: t.external_url,
            error: t.error,
          }
        : null;
    })
    .filter(Boolean)
    .sort((a: any, b: any) => {
      const order = ["x", "instagram", "threads", "linkedin"];
      const d = order.indexOf(a.platform) - order.indexOf(b.platform);
      return d || a.handle.localeCompare(b.handle);
    });
}

const partsOf = (itemId: string) =>
  load()
    .parts.filter((p) => p.item_id === itemId)
    .sort((a, b) => a.order_index - b.order_index);

const assetsOf = (itemId: string) =>
  live(load().assets)
    .filter((a) => a.item_id === itemId)
    .sort((a, b) => a.order_index - b.order_index);

function entryOf(item: Row) {
  const parts = partsOf(item.id);
  return {
    id: item.id,
    project_id: item.project_id,
    title: item.title,
    kind: item.kind,
    status: item.status,
    scheduled_for: item.scheduled_for,
    timezone: item.timezone,
    body: parts[0]?.body ?? item.body,
    part_count: parts.length,
    asset_count: assetsOf(item.id).length,
    assets: assetsOf(item.id)
      .slice(0, 4)
      .map((a) => a.file_path),
    targets: targetsOf(item.id),
  };
}

function syncBody(itemId: string) {
  const d = load();
  const item = d.items.find((i) => i.id === itemId);
  if (item) {
    item.body = partsOf(itemId)[0]?.body ?? "";
    item.updated_at = now();
  }
}

// Command dispatch

export async function mockInvoke<T>(
  cmd: string,
  args?: Record<string, any>,
): Promise<T> {
  const d = load();
  const a = args ?? {};
  const out = handle(d, cmd, a);
  save();
  return out as T;
}

function handle(d: Db, cmd: string, a: Record<string, any>): unknown {
  switch (cmd) {
    // ── Projects ──
    case "list_projects":
      return live(d.projects).sort(
        (x, y) =>
          Number(x.is_personal) - Number(y.is_personal) ||
          x.name.localeCompare(y.name),
      );
    case "create_project": {
      const p = {
        id: uid(),
        name: a.name,
        description: a.description ?? null,
        website: null,
        logo_path: null,
        is_personal: !!a.isPersonal,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };
      d.projects.push(p);
      return p;
    }
    case "update_project": {
      const p = d.projects.find((x) => x.id === a.id);
      if (!p) throw new Error("project not found");
      for (const k of ["name", "description", "website", "logo_path"]) {
        if (a[k] !== undefined) p[k] = a[k];
      }
      p.updated_at = now();
      return p;
    }
    case "delete_project": {
      const p = d.projects.find((x) => x.id === a.id);
      if (p) p.deleted_at = now();
      d.items
        .filter((i) => i.project_id === a.id)
        .forEach((i) => (i.deleted_at = now()));
      d.account_projects = d.account_projects.filter(
        (ap) => ap.project_id !== a.id,
      );
      return null;
    }

    // ── Accounts ──
    case "list_accounts": {
      const pid: string | null = a.projectId ?? null;
      return live(d.accounts)
        .filter(
          (x) =>
            pid === null ||
            x.is_global ||
            d.account_projects.some(
              (ap) => ap.account_id === x.id && ap.project_id === pid,
            ),
        )
        .map(accountRow)
        .sort(
          (x, y) =>
            x.platform.localeCompare(y.platform) ||
            x.order_index - y.order_index ||
            x.handle.localeCompare(y.handle),
        );
    }
    case "create_account": {
      const acc = {
        id: uid(),
        platform: a.platform,
        handle: a.handle,
        display_name: a.displayName ?? null,
        avatar_path: null,
        is_global: !!a.isGlobal,
        connection_status: "manual",
        order_index: d.accounts.filter((x) => x.platform === a.platform).length,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };
      d.accounts.push(acc);
      if (!acc.is_global) {
        for (const pid of a.projectIds ?? []) {
          d.account_projects.push({ account_id: acc.id, project_id: pid });
        }
      }
      return accountRow(acc);
    }
    case "update_account": {
      const acc = d.accounts.find((x) => x.id === a.id);
      if (!acc) throw new Error("account not found");
      Object.assign(acc, a.patch, { updated_at: now() });
      if (acc.is_global) {
        d.account_projects = d.account_projects.filter(
          (ap) => ap.account_id !== acc.id,
        );
      }
      return accountRow(acc);
    }
    case "set_account_projects": {
      const acc = d.accounts.find((x) => x.id === a.accountId);
      if (!acc) throw new Error("account not found");
      acc.is_global = a.isGlobal;
      acc.updated_at = now();
      d.account_projects = d.account_projects.filter(
        (ap) => ap.account_id !== acc.id,
      );
      if (!acc.is_global) {
        for (const pid of a.projectIds ?? []) {
          d.account_projects.push({ account_id: acc.id, project_id: pid });
        }
      }
      return accountRow(acc);
    }
    case "delete_account": {
      const acc = d.accounts.find((x) => x.id === a.id);
      if (acc) acc.deleted_at = now();
      d.targets = d.targets.filter((t) => t.account_id !== a.id);
      d.account_projects = d.account_projects.filter(
        (ap) => ap.account_id !== a.id,
      );
      return null;
    }
    case "import_legacy_accounts":
      return [];

    // ── Queue ──
    case "list_queue": {
      const pid: string | null = a.projectId ?? null;
      return live(d.items)
        .filter((i) => pid === null || i.project_id === pid)
        .filter(
          (i) =>
            (i.scheduled_for &&
              i.scheduled_for >= a.from &&
              i.scheduled_for < a.to) ||
            (!i.scheduled_for && i.status === "draft"),
        )
        .sort((x, y) => {
          if (!x.scheduled_for && !y.scheduled_for) return 0;
          if (!x.scheduled_for) return 1;
          if (!y.scheduled_for) return -1;
          return x.scheduled_for.localeCompare(y.scheduled_for);
        })
        .map(entryOf);
    }
    case "next_due": {
      const pid: string | null = a.projectId ?? null;
      const nowStamp = stamp(0, new Date().getHours(), new Date().getMinutes());
      const hit = live(d.items)
        .filter(
          (i) =>
            (pid === null || i.project_id === pid) &&
            i.scheduled_for &&
            i.scheduled_for >= nowStamp &&
            i.status === "scheduled" &&
            d.targets.some((t) => t.item_id === i.id && t.status === "queued"),
        )
        .sort((x, y) => x.scheduled_for.localeCompare(y.scheduled_for))[0];
      return hit ? entryOf(hit) : null;
    }
    case "schedule_item": {
      const i = d.items.find((x) => x.id === a.itemId);
      if (!i) throw new Error("item not found");
      i.scheduled_for = a.scheduledFor;
      i.timezone = a.timezone ?? null;
      if (i.status !== "published") i.status = "scheduled";
      i.updated_at = now();
      return null;
    }
    case "unschedule_item": {
      const i = d.items.find((x) => x.id === a.itemId);
      if (!i) throw new Error("item not found");
      i.scheduled_for = null;
      if (i.status === "scheduled") i.status = "draft";
      i.updated_at = now();
      return null;
    }
    case "list_item_targets":
      return targetsOf(a.itemId);
    case "set_item_targets": {
      const ids: string[] = a.accountIds ?? [];
      d.targets = d.targets.filter(
        (t) => t.item_id !== a.itemId || ids.includes(t.account_id),
      );
      for (const account_id of ids) {
        if (
          !d.targets.some(
            (t) => t.item_id === a.itemId && t.account_id === account_id,
          )
        ) {
          d.targets.push({
            id: uid(),
            item_id: a.itemId,
            account_id,
            status: "queued",
            posted_at: null,
            external_url: null,
            error: null,
          });
        }
      }
      return null;
    }
    case "set_target_status": {
      const t = d.targets.find(
        (x) => x.item_id === a.itemId && x.account_id === a.accountId,
      );
      if (t) {
        t.status = a.status;
        t.posted_at = a.status === "posted" ? now() : null;
        t.external_url = a.externalUrl ?? null;
        t.error = a.error ?? null;
      }
      const rest = d.targets.filter((x) => x.item_id === a.itemId);
      if (!rest.some((x) => x.status === "queued")) {
        const i = d.items.find((x) => x.id === a.itemId);
        if (i)
          i.status = rest.some((x) => x.status === "failed")
            ? "failed"
            : "published";
      }
      return null;
    }

    // ── Items ──
    case "list_library": {
      const pid: string | null = a.projectId ?? null;
      const q = (a.query ?? "").trim().toLowerCase();
      return live(d.items)
        .filter((i) => pid === null || i.project_id === pid)
        .filter((i) => !a.kindFilter || i.kind === a.kindFilter)
        .filter(
          (i) =>
            !q ||
            i.title.toLowerCase().includes(q) ||
            (i.body ?? "").toLowerCase().includes(q),
        )
        .sort((x, y) => y.created_at.localeCompare(x.created_at))
        .map((i) => ({
          id: i.id,
          project_id: i.project_id,
          folder_id: i.folder_id,
          title: i.title,
          kind: i.kind,
          status: i.status,
          body: partsOf(i.id)[0]?.body ?? i.body,
          scheduled_for: i.scheduled_for,
          part_count: partsOf(i.id).length,
          asset_count: assetsOf(i.id).length,
          assets: assetsOf(i.id).map((x) => x.file_path),
          targets: targetsOf(i.id),
          created_at: i.created_at,
          updated_at: i.updated_at,
        }));
    }
    case "library_counts": {
      const pid: string | null = a.projectId ?? null;
      const counts = new Map<string, number>();
      for (const i of live(d.items)) {
        if (pid !== null && i.project_id !== pid) continue;
        counts.set(i.kind, (counts.get(i.kind) ?? 0) + 1);
      }
      return [...counts.entries()];
    }
    case "smart_list_counts": {
      const pid: string | null = a.projectId ?? null;
      const scope = live(d.items).filter(
        (i) => pid === null || i.project_id === pid,
      );
      return [
        ["queue", scope.filter((i) => i.status === "scheduled").length],
        ["library", scope.length],
        [
          "notes",
          scope.filter((i) => i.kind === "note" || i.status === "idea").length,
        ],
        ["drafts", scope.filter((i) => i.status === "draft").length],
        ["published", scope.filter((i) => i.status === "published").length],
      ];
    }
    case "get_item": {
      const i = d.items.find((x) => x.id === a.id);
      if (!i) throw new Error("item not found");
      return {
        ...i,
        asset_count: assetsOf(i.id).length,
        cover_path: assetsOf(i.id)[0]?.file_path ?? null,
      };
    }
    case "create_item": {
      const i = {
        id: uid(),
        project_id: a.projectId,
        folder_id: a.folderId ?? null,
        title: a.title,
        kind: a.kind ?? "note",
        body: a.body ?? "",
        status: a.status ?? "idea",
        scheduled_for: null,
        timezone: null,
        order_index: d.items.length,
        created_at: now(),
        updated_at: now(),
        deleted_at: null,
      };
      d.items.push(i);
      d.parts.push({
        id: uid(),
        item_id: i.id,
        order_index: 0,
        body: a.body ?? "",
        created_at: now(),
        updated_at: now(),
      });
      return { ...i, asset_count: 0, cover_path: null };
    }
    case "update_item": {
      const i = d.items.find((x) => x.id === a.id);
      if (!i) throw new Error("item not found");
      const patch = a.patch ?? {};
      Object.assign(i, patch);
      if (patch.status === undefined && patch.scheduled_for !== undefined) {
        if (i.status !== "published" && i.status !== "failed") {
          i.status = i.scheduled_for
            ? "scheduled"
            : i.status === "scheduled"
              ? "draft"
              : i.status;
        }
      }
      i.updated_at = now();
      return {
        ...i,
        asset_count: assetsOf(i.id).length,
        cover_path: assetsOf(i.id)[0]?.file_path ?? null,
      };
    }
    case "delete_item": {
      const i = d.items.find((x) => x.id === a.id);
      if (i) i.deleted_at = now();
      return null;
    }
    case "duplicate_item": {
      const src = d.items.find((x) => x.id === a.id);
      if (!src) throw new Error("item not found");
      const copy = {
        ...src,
        id: uid(),
        title: `${src.title} copy`,
        status: "draft",
        scheduled_for: null,
        created_at: now(),
        updated_at: now(),
      };
      d.items.push(copy);
      for (const p of partsOf(src.id))
        d.parts.push({ ...p, id: uid(), item_id: copy.id });
      for (const s of assetsOf(src.id))
        d.assets.push({ ...s, id: uid(), item_id: copy.id });
      return {
        ...copy,
        asset_count: assetsOf(copy.id).length,
        cover_path: null,
      };
    }

    // ── Parts ──
    case "list_item_parts":
      return partsOf(a.itemId);
    case "upsert_item_part": {
      if (a.partId) {
        const p = d.parts.find((x) => x.id === a.partId);
        if (!p) throw new Error("part not found");
        p.body = a.body;
        if (a.orderIndex != null) p.order_index = a.orderIndex;
        p.updated_at = now();
        syncBody(a.itemId);
        return p;
      }
      const p = {
        id: uid(),
        item_id: a.itemId,
        order_index: a.orderIndex ?? partsOf(a.itemId).length,
        body: a.body,
        created_at: now(),
        updated_at: now(),
      };
      d.parts.push(p);
      syncBody(a.itemId);
      return p;
    }
    case "delete_item_part": {
      const p = d.parts.find((x) => x.id === a.partId);
      if (!p) return null;
      const itemId = p.item_id;
      d.parts = d.parts.filter((x) => x.id !== a.partId);
      partsOf(itemId).forEach((x, i) => (x.order_index = i));
      syncBody(itemId);
      return null;
    }
    case "reorder_item_parts": {
      (a.orderedIds as string[]).forEach((id, i) => {
        const p = d.parts.find((x) => x.id === id);
        if (p) p.order_index = i;
      });
      syncBody(a.itemId);
      return null;
    }

    // ── Assets ──
    case "list_item_assets":
      return assetsOf(a.itemId);
    case "add_item_asset": {
      d.assets.push({
        id: uid(),
        item_id: a.itemId,
        part_id: a.partId ?? null,
        file_path: a.sourcePath,
        order_index: assetsOf(a.itemId).length,
        alt_text: null,
        deleted_at: null,
      });
      return null;
    }
    case "remove_item_asset": {
      const s = d.assets.find((x) => x.id === a.id);
      if (s) s.deleted_at = now();
      return null;
    }
    case "asset_abs_path":
      return a.filePath;
    case "import_paths":
      return [];

    // ── Folders ──
    case "list_folders":
      return d.folders.filter(
        (f) => !a.projectId || f.project_id === a.projectId,
      );
    case "create_folder": {
      const f = {
        id: uid(),
        project_id: a.projectId,
        parent_id: a.parentId ?? null,
        name: a.name,
        order_index: d.folders.length,
        created_at: now(),
        updated_at: now(),
      };
      d.folders.push(f);
      return f;
    }
    case "rename_folder": {
      const f = d.folders.find((x) => x.id === a.id);
      if (!f) throw new Error("folder not found");
      f.name = a.name;
      return f;
    }
    case "delete_folder":
      d.folders = d.folders.filter((f) => f.id !== a.id);
      return null;

    // ── Delivery ──
    case "list_due_now": {
      const nowStamp = stamp(0, new Date().getHours(), new Date().getMinutes());
      return live(d.items)
        .filter(
          (i) =>
            i.scheduled_for &&
            i.scheduled_for <= nowStamp &&
            i.status === "scheduled",
        )
        .flatMap((i) =>
          d.targets
            .filter((t) => t.item_id === i.id && t.status === "queued")
            .map((t) => {
              const acc = d.accounts.find((x) => x.id === t.account_id);
              return {
                item_id: i.id,
                account_id: t.account_id,
                handle: acc?.handle ?? "",
                platform: acc?.platform ?? "",
                title: i.title,
                scheduled_for: i.scheduled_for,
              };
            }),
        );
    }
    case "item_clipboard_text":
      return partsOf(a.itemId)
        .map((p) => p.body)
        .join("\n\n");
    case "reveal_item_assets":
      return null;

    case "seed_demo":
      db = seed();
      return null;

    default:
      throw new Error(`mock: unknown command ${cmd}`);
  }
}
