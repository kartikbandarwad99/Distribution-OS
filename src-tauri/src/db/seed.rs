use chrono::{Duration, Local, NaiveDate, NaiveDateTime, NaiveTime};
use rusqlite::{params, Connection};
use tauri::State;

use super::{now, AppResult, AppState};

/// Sample data so a fresh install has something to look at — and the shape the
/// acceptance criteria describe: three projects, five accounts (two global),
/// and a scheduled thread with three parts going to two accounts.
///
/// Runs once, on a database with no accounts and no content. Times are laid out
/// relative to today so the queue and the calendar always have something in them.
#[tauri::command]
pub fn seed_demo(state: State<AppState>) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    run(&conn)
}

pub fn seed_if_empty(conn: &Connection) -> AppResult<()> {
    let accounts: i64 = conn.query_row("SELECT COUNT(*) FROM accounts", [], |r| r.get(0))?;
    let items: i64 = conn.query_row("SELECT COUNT(*) FROM content_items", [], |r| r.get(0))?;
    if accounts > 0 || items > 0 {
        return Ok(());
    }
    run(conn)
}

fn project_id(conn: &Connection, name: &str) -> AppResult<String> {
    Ok(conn.query_row(
        "SELECT id FROM projects WHERE name = ?1 AND deleted_at IS NULL LIMIT 1",
        params![name],
        |r| r.get(0),
    )?)
}

fn account(
    conn: &Connection,
    platform: &str,
    handle: &str,
    display_name: &str,
    is_global: bool,
    connected: bool,
    projects: &[&str],
    order: i64,
) -> AppResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    conn.execute(
        "INSERT INTO accounts
            (id, platform, handle, display_name, is_global, connection_status,
             order_index, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 'local')",
        params![
            id,
            platform,
            handle,
            display_name,
            is_global as i32,
            if connected { "connected" } else { "manual" },
            order,
            ts
        ],
    )?;
    for p in projects {
        conn.execute(
            "INSERT OR IGNORE INTO account_projects (account_id, project_id) VALUES (?1, ?2)",
            params![id, p],
        )?;
    }
    Ok(id)
}

struct Draft<'a> {
    project: &'a str,
    title: &'a str,
    kind: &'a str,
    status: &'a str,
    /// Days from today, and a wall-clock time. `None` = no time yet.
    when: Option<(i64, u32, u32)>,
    parts: &'a [&'a str],
    targets: &'a [&'a str],
}

fn item(conn: &Connection, d: &Draft) -> AppResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    let scheduled_for = d.when.map(|(days, h, m)| {
        let date: NaiveDate = Local::now().date_naive() + Duration::days(days);
        let t = NaiveTime::from_hms_opt(h, m, 0).unwrap();
        NaiveDateTime::new(date, t)
            .format("%Y-%m-%dT%H:%M:%S")
            .to_string()
    });
    let body = d.parts.first().copied().unwrap_or("");
    conn.execute(
        "INSERT INTO content_items
            (id, project_id, title, kind, body, status, scheduled_for, timezone,
             order_index, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 0, ?9, ?9, 'local')",
        params![
            id,
            d.project,
            d.title,
            d.kind,
            body,
            d.status,
            scheduled_for,
            "Asia/Kolkata",
            ts
        ],
    )?;
    for (i, part) in d.parts.iter().enumerate() {
        conn.execute(
            "INSERT INTO item_parts (id, item_id, order_index, body, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                i as i64,
                part,
                ts
            ],
        )?;
    }
    for account_id in d.targets {
        conn.execute(
            "INSERT OR IGNORE INTO item_targets (id, item_id, account_id, status)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                uuid::Uuid::new_v4().to_string(),
                id,
                account_id,
                if d.status == "published" { "posted" } else { "queued" }
            ],
        )?;
    }
    Ok(id)
}

fn run(conn: &Connection) -> AppResult<()> {
    let mysocial = project_id(conn, "mysocial")?;
    let fretbase = project_id(conn, "Fretbase")?;
    let personal = project_id(conn, "Personal brand")?;

    // Two global accounts (the personal handles, used from every project) and
    // three scoped ones.
    let x_app = account(conn, "x", "@mysocialapp", "mysocial", false, true, &[&mysocial], 0)?;
    let x_me = account(conn, "x", "@kartikbuilds", "Kartik", true, true, &[], 1)?;
    let ig_app = account(conn, "instagram", "@mysocial.app", "mysocial", false, true, &[&mysocial], 0)?;
    let th_me = account(conn, "threads", "@kartikbuilds", "Kartik", true, true, &[], 0)?;
    let li_me = account(
        conn,
        "linkedin",
        "Kartik Bandarwad",
        "Kartik Bandarwad",
        false,
        false,
        &[&personal],
        0,
    )?;
    let ig_fret = account(conn, "instagram", "@fretbase", "Fretbase", false, true, &[&fretbase], 1)?;

    let drafts = [
        Draft {
            project: &mysocial,
            title: "Local-first launch thread",
            kind: "thread",
            status: "scheduled",
            when: Some((0, 11, 30)),
            parts: &[
                "Most schedulers are built for teams of 30.\n\nI built one for a team of one — it runs on my Mac, stores nothing in the cloud, and costs $0/mo.\n\nHere's how it works →",
                "1. Everything lives in one SQLite file on disk. No account, no sync, no server that can shut down.",
                "2. Multiple accounts per platform, because I run a product handle and a personal one and I'm tired of logging out.",
            ],
            targets: &[&x_app, &th_me],
        },
        Draft {
            project: &mysocial,
            title: "7 things I got wrong building a Mac app in Tauri",
            kind: "carousel",
            status: "scheduled",
            when: Some((0, 18, 0)),
            parts: &[
                "7 things I got wrong building a native Mac app in Tauri — swipe for the ones that cost me a weekend.",
                "1. I reached for a web router before I knew what the windows were.",
                "2. HTML5 drag and drop fights the native file-drop layer. Pointer events don't.",
            ],
            targets: &[&ig_app],
        },
        Draft {
            project: &personal,
            title: "Saturday shipping",
            kind: "post",
            status: "scheduled",
            when: Some((0, 21, 15)),
            parts: &["shipping something small every saturday is the only consistency hack that has ever worked for me"],
            targets: &[&th_me],
        },
        Draft {
            project: &mysocial,
            title: "Local-first means…",
            kind: "post",
            status: "scheduled",
            when: Some((1, 9, 0)),
            parts: &["Local-first means your drafts survive the company that made the app. Screenshot of the SQLite file, because that's the whole backend."],
            targets: &[&x_app],
        },
        Draft {
            project: &personal,
            title: "Why I stopped paying $49/mo for a social scheduler",
            kind: "article",
            status: "draft",
            when: None,
            parts: &["Why I stopped paying $49/mo for a social scheduler and spent three weekends instead…"],
            targets: &[&li_me],
        },
        Draft {
            project: &personal,
            title: "Week 12 in public",
            kind: "post",
            status: "scheduled",
            when: Some((2, 8, 30)),
            parts: &["week 12 of building in public. revenue: $0. lessons: several. still going."],
            targets: &[&x_me],
        },
        Draft {
            project: &mysocial,
            title: "Idea → scheduled in four keystrokes",
            kind: "reel",
            status: "scheduled",
            when: Some((2, 19, 0)),
            parts: &["30-second screen recording: idea → scheduled post in four keystrokes."],
            targets: &[&ig_app],
        },
        Draft {
            project: &mysocial,
            title: "Pricing page teardown",
            kind: "carousel",
            status: "scheduled",
            when: Some((4, 12, 30)),
            parts: &["Pricing page teardown: why I charge nothing (for now) and what that buys me."],
            targets: &[&ig_app],
        },
        Draft {
            project: &mysocial,
            title: "Drafts and the SaaS graveyard",
            kind: "note",
            status: "idea",
            when: None,
            parts: &["Angle worth testing: nobody talks about what happens to your drafts when the SaaS shuts down. Lead with the SQLite file."],
            targets: &[],
        },
        Draft {
            project: &mysocial,
            title: "Record the demo",
            kind: "note",
            status: "idea",
            when: None,
            parts: &["- [ ] record the 30s demo before Friday\n- [ ] clean desktop\n- [ ] fake dataset that looks real"],
            targets: &[],
        },
        Draft {
            project: &personal,
            title: "Week 13 in public",
            kind: "thread",
            status: "draft",
            when: None,
            parts: &[
                "week 13. shipped the calendar, broke the composer twice, learned what a masonry column is.",
                "the drag-to-reschedule took four hours and thirty of those minutes were the actual drag.",
            ],
            targets: &[&x_me],
        },
        Draft {
            project: &fretbase,
            title: "Fretboard drill of the week",
            kind: "reel",
            status: "scheduled",
            when: Some((3, 17, 0)),
            parts: &["One drill, five positions, ninety seconds. Save this for your next practice session."],
            targets: &[&ig_fret],
        },
        Draft {
            project: &fretbase,
            title: "Three months of building, in screenshots",
            kind: "carousel",
            status: "published",
            when: Some((-6, 12, 0)),
            parts: &["Three months of building, in screenshots. The first one is embarrassing."],
            targets: &[&ig_fret],
        },
        Draft {
            project: &mysocial,
            title: "App icon exploration, round 3",
            kind: "image",
            status: "published",
            when: Some((-9, 10, 0)),
            parts: &["App icon exploration, round 3. Warmer, and the paper texture finally survived export."],
            targets: &[&ig_app],
        },
        Draft {
            project: &mysocial,
            title: "Month wrap",
            kind: "post",
            status: "scheduled",
            when: Some((6, 16, 0)),
            parts: &["month wrap: 14 posts, 2 platforms, 0 servers."],
            targets: &[&x_app, &x_me],
        },
    ];

    for d in &drafts {
        item(conn, d)?;
    }
    Ok(())
}
