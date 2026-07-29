/*!
Delivery.

v1 does not call platform APIs. Real auto-posting needs API keys, a background
scheduler and — for Instagram and Threads — Meta app review; that is weeks of
work on the part most likely to break, and it blocks everything else.

Instead a timer watches the queue and, when something comes due, fires a native
notification. The app opens on that item with the text one click from the
clipboard and the images one click from Finder. Marking it done writes
`item_targets.status = 'posted'`.

The seam is a `Publisher` per platform. `ManualPublisher` is the only one wired
up; a real X publisher (the one platform with a usable free write tier) slots in
behind the same trait later.
*/

use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use chrono::Local;
use rusqlite::params;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;

use crate::db::{items, AppResult, AppState};

/// One account's copy of an item, at the moment it comes due.
#[derive(Debug, Clone, Serialize)]
pub struct PendingPost {
    pub item_id: String,
    pub account_id: String,
    pub handle: String,
    pub platform: String,
    pub title: String,
    pub scheduled_for: String,
}

#[derive(Debug)]
pub enum Delivery {
    /// Handed to the human: notified, waiting for them to post and confirm.
    Manual,
    #[allow(dead_code)]
    Posted { external_url: Option<String> },
    #[allow(dead_code)]
    Failed { error: String },
}

pub trait Publisher: Send + Sync {
    /// Platform this publisher handles, or "*" for any.
    fn platform(&self) -> &'static str;
    fn publish(&self, app: &AppHandle, post: &PendingPost) -> Delivery;
}

/// Works on day one, for every platform, with no API keys.
pub struct ManualPublisher;

impl Publisher for ManualPublisher {
    fn platform(&self) -> &'static str {
        "*"
    }

    fn publish(&self, app: &AppHandle, post: &PendingPost) -> Delivery {
        let _ = app
            .notification()
            .builder()
            .title(format!("Post to {} — now", post.handle))
            .body(if post.title.is_empty() {
                "Open Distribution to copy it".to_string()
            } else {
                post.title.clone()
            })
            .show();
        // The window is already open on the desktop this app lives on; the
        // event puts the item in front of the user.
        let _ = app.emit("delivery:due", post.clone());
        Delivery::Manual
    }
}

/// Real API publishers get appended here, one per platform. X first — it is
/// the only platform with a usable free write tier.
const PUBLISHERS: [&dyn Publisher; 1] = [&ManualPublisher];

fn publisher_for(platform: &str) -> &'static dyn Publisher {
    PUBLISHERS
        .into_iter()
        .find(|p| p.platform() == platform)
        .unwrap_or(&ManualPublisher)
}

/// Targets already announced this session, so a minute tick doesn't renotify.
#[derive(Default)]
pub struct Announced(pub Mutex<HashSet<String>>);

/// Poll the queue once a minute. A desktop app that is running is the only
/// place this needs to work, so a plain thread beats a cron dependency.
pub fn start(app: AppHandle) {
    std::thread::spawn(move || loop {
        if let Err(e) = tick(&app) {
            eprintln!("delivery tick: {e}");
        }
        std::thread::sleep(Duration::from_secs(60));
    });
}

fn tick(app: &AppHandle) -> AppResult<()> {
    let due = due_posts(app)?;
    let announced = app.state::<Announced>();
    for post in due {
        let key = format!("{}:{}", post.item_id, post.account_id);
        {
            let mut seen = announced.0.lock().unwrap();
            if !seen.insert(key) {
                continue;
            }
        }
        publisher_for(&post.platform).publish(app, &post);
    }
    Ok(())
}

fn due_posts(app: &AppHandle) -> AppResult<Vec<PendingPost>> {
    let state = app.state::<AppState>();
    let conn = state.db.lock().unwrap();
    let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let mut stmt = conn.prepare(
        "SELECT i.id, t.account_id, a.handle, a.platform, i.title, i.scheduled_for
           FROM content_items i
           JOIN item_targets t ON t.item_id = i.id AND t.status = 'queued'
           JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
          WHERE i.deleted_at IS NULL
            AND i.scheduled_for IS NOT NULL
            AND i.scheduled_for <= ?1
            AND i.status = 'scheduled'
          ORDER BY i.scheduled_for ASC",
    )?;
    let rows = stmt
        .query_map(params![now], |r| {
            Ok(PendingPost {
                item_id: r.get(0)?,
                account_id: r.get(1)?,
                handle: r.get(2)?,
                platform: r.get(3)?,
                title: r.get(4)?,
                scheduled_for: r.get(5)?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Everything whose time has passed and is still waiting on you — the delivery
/// strip in the composer reads this on launch, before the first tick.
#[tauri::command]
pub fn list_due_now(app: AppHandle) -> AppResult<Vec<PendingPost>> {
    due_posts(&app)
}

/// Text of every part, joined — what "Copy post" puts on the clipboard.
#[tauri::command]
pub fn item_clipboard_text(state: State<AppState>, item_id: String) -> AppResult<String> {
    let conn = state.db.lock().unwrap();
    items::full_text(&conn, &item_id)
}

/// Reveal the item's images in Finder so they can be dragged into the app
/// you're posting from.
#[tauri::command]
pub fn reveal_item_assets(app: AppHandle, state: State<AppState>, item_id: String) -> AppResult<()> {
    let paths = {
        let conn = state.db.lock().unwrap();
        items::asset_paths(&conn, &item_id)?
    };
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::db::AppError::Other(format!("app data dir: {e}")))?;
    let absolute: Vec<String> = paths
        .iter()
        .map(|p| dir.join(p).to_string_lossy().to_string())
        .collect();
    if absolute.is_empty() {
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = std::process::Command::new("open");
        cmd.arg("-R");
        for p in &absolute {
            cmd.arg(p);
        }
        cmd.spawn()?;
    }
    Ok(())
}
