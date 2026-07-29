use rusqlite::{params, params_from_iter, Connection, Row};
use serde::Serialize;
use tauri::State;

use super::{now, AppResult, AppState};

/// One account an item goes out to, with its own delivery status.
#[derive(Debug, Serialize)]
pub struct QueueTarget {
    pub account_id: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub platform: String,
    pub status: String,
    pub posted_at: Option<String>,
    pub external_url: Option<String>,
    pub error: Option<String>,
}

/// A row in the queue, the calendar, or the "next up" footer: everything the
/// UI needs to draw it without a second round-trip.
#[derive(Debug, Serialize)]
pub struct QueueEntry {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub kind: String,
    pub status: String,
    /// Local wall-clock timestamp, 'YYYY-MM-DDTHH:MM:SS'. None = needs a time.
    pub scheduled_for: Option<String>,
    pub timezone: Option<String>,
    /// First part's text, for the two-line clamp on the row.
    pub body: Option<String>,
    pub part_count: i64,
    pub asset_count: i64,
    /// Up to four asset paths for the thumb strip.
    pub assets: Vec<String>,
    pub targets: Vec<QueueTarget>,
}

const ENTRY_SELECT: &str = "SELECT i.id, i.project_id, i.title, i.kind, i.status,
        i.scheduled_for, i.timezone,
        COALESCE((SELECT p.body FROM item_parts p WHERE p.item_id = i.id
                   ORDER BY p.order_index ASC LIMIT 1), i.body) AS body,
        (SELECT COUNT(*) FROM item_parts p WHERE p.item_id = i.id) AS part_count,
        (SELECT COUNT(*) FROM item_assets a WHERE a.item_id = i.id AND a.deleted_at IS NULL)
            AS asset_count
     FROM content_items i";

fn entry_from_row(row: &Row) -> rusqlite::Result<QueueEntry> {
    Ok(QueueEntry {
        id: row.get("id")?,
        project_id: row.get("project_id")?,
        title: row.get("title")?,
        kind: row.get("kind")?,
        status: row.get("status")?,
        scheduled_for: row.get("scheduled_for")?,
        timezone: row.get("timezone")?,
        body: row.get("body")?,
        part_count: row.get("part_count")?,
        asset_count: row.get("asset_count")?,
        assets: Vec::new(),
        targets: Vec::new(),
    })
}

/// `(item_id, target)` for a batch of items — one query instead of one per row.
/// Shared with the library, which draws the same account chip.
pub fn targets_for(conn: &Connection, ids: &[String]) -> AppResult<Vec<(String, QueueTarget)>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let holes = vec!["?"; ids.len()].join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT t.item_id, t.account_id, a.handle, a.display_name, a.platform,
                t.status, t.posted_at, t.external_url, t.error
           FROM item_targets t
           JOIN accounts a ON a.id = t.account_id AND a.deleted_at IS NULL
          WHERE t.item_id IN ({holes})
          ORDER BY CASE a.platform WHEN 'x' THEN 0 WHEN 'instagram' THEN 1
                                   WHEN 'threads' THEN 2 ELSE 3 END, a.handle"
    ))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |r| {
            Ok((
                r.get::<_, String>("item_id")?,
                QueueTarget {
                    account_id: r.get("account_id")?,
                    handle: r.get("handle")?,
                    display_name: r.get("display_name")?,
                    platform: r.get("platform")?,
                    status: r.get("status")?,
                    posted_at: r.get("posted_at")?,
                    external_url: r.get("external_url")?,
                    error: r.get("error")?,
                },
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// `(item_id, file_path)` in order, for the thumb strips and library media.
pub fn assets_for(conn: &Connection, ids: &[String]) -> AppResult<Vec<(String, String)>> {
    if ids.is_empty() {
        return Ok(Vec::new());
    }
    let holes = vec!["?"; ids.len()].join(",");
    let mut stmt = conn.prepare(&format!(
        "SELECT item_id, file_path FROM item_assets
          WHERE item_id IN ({holes}) AND deleted_at IS NULL
          ORDER BY item_id, order_index ASC"
    ))?;
    let rows = stmt
        .query_map(params_from_iter(ids.iter()), |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Fill in targets and the first four assets for a batch of entries.
fn hydrate(conn: &Connection, entries: &mut [QueueEntry]) -> AppResult<()> {
    if entries.is_empty() {
        return Ok(());
    }
    let ids: Vec<String> = entries.iter().map(|e| e.id.clone()).collect();
    for (item_id, target) in targets_for(conn, &ids)? {
        if let Some(e) = entries.iter_mut().find(|e| e.id == item_id) {
            e.targets.push(target);
        }
    }
    for (item_id, path) in assets_for(conn, &ids)? {
        if let Some(e) = entries.iter_mut().find(|e| e.id == item_id) {
            if e.assets.len() < 4 {
                e.assets.push(path);
            }
        }
    }
    Ok(())
}

/// Everything scheduled between `from` and `to` (inclusive of `from`, exclusive
/// of `to`, both local 'YYYY-MM-DDTHH:MM:SS'), plus every undated draft at the
/// end — the queue shows those as "Needs a time".
#[tauri::command]
pub fn list_queue(
    state: State<AppState>,
    project_id: Option<String>,
    from: String,
    to: String,
) -> AppResult<Vec<QueueEntry>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "{ENTRY_SELECT}
          WHERE i.deleted_at IS NULL
            AND (?1 IS NULL OR i.project_id = ?1)
            AND ((i.scheduled_for >= ?2 AND i.scheduled_for < ?3)
                 OR (i.scheduled_for IS NULL AND i.status = 'draft'))
          ORDER BY i.scheduled_for IS NULL, i.scheduled_for ASC, i.updated_at DESC"
    ))?;
    let mut entries = stmt
        .query_map(params![project_id, from, to], entry_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    hydrate(&conn, &mut entries)?;
    Ok(entries)
}

/// The next thing that goes out from now on — drives the sidebar footer and the
/// delivery timer.
#[tauri::command]
pub fn next_due(state: State<AppState>, project_id: Option<String>) -> AppResult<Option<QueueEntry>> {
    let conn = state.db.lock().unwrap();
    next_due_inner(&conn, project_id.as_deref())
}

pub fn next_due_inner(conn: &Connection, project_id: Option<&str>) -> AppResult<Option<QueueEntry>> {
    let mut stmt = conn.prepare(&format!(
        "{ENTRY_SELECT}
          WHERE i.deleted_at IS NULL
            AND (?1 IS NULL OR i.project_id = ?1)
            AND i.scheduled_for IS NOT NULL
            AND i.status = 'scheduled'
            AND EXISTS (SELECT 1 FROM item_targets t
                         WHERE t.item_id = i.id AND t.status = 'queued')
          ORDER BY i.scheduled_for ASC
          LIMIT 1"
    ))?;
    let mut entries = stmt
        .query_map(params![project_id], entry_from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);
    hydrate(conn, &mut entries)?;
    Ok(entries.into_iter().next())
}

/// Put an item on the timeline. Scheduling implies status 'scheduled' unless
/// it has already gone out.
#[tauri::command]
pub fn schedule_item(
    state: State<AppState>,
    item_id: String,
    scheduled_for: String,
    timezone: Option<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE content_items
            SET scheduled_for = ?2, timezone = ?3,
                status = CASE WHEN status = 'published' THEN status ELSE 'scheduled' END,
                updated_at = ?4, sync_status = 'local'
          WHERE id = ?1",
        params![item_id, scheduled_for, timezone, now()],
    )?;
    Ok(())
}

/// Take it back off the timeline. It becomes a draft again — never an idea,
/// because it has already been worked on.
#[tauri::command]
pub fn unschedule_item(state: State<AppState>, item_id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE content_items
            SET scheduled_for = NULL, timezone = NULL,
                status = CASE WHEN status = 'scheduled' THEN 'draft' ELSE status END,
                updated_at = ?2, sync_status = 'local'
          WHERE id = ?1",
        params![item_id, now()],
    )?;
    Ok(())
}

/// The accounts one item goes out to — what the composer's chips read.
#[tauri::command]
pub fn list_item_targets(state: State<AppState>, item_id: String) -> AppResult<Vec<QueueTarget>> {
    let conn = state.db.lock().unwrap();
    Ok(targets_for(&conn, &[item_id])?
        .into_iter()
        .map(|(_, t)| t)
        .collect())
}

/// Replace an item's targets. Existing rows are kept so their delivery status
/// and posted_at survive a re-save.
#[tauri::command]
pub fn set_item_targets(
    state: State<AppState>,
    item_id: String,
    account_ids: Vec<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    if account_ids.is_empty() {
        conn.execute("DELETE FROM item_targets WHERE item_id = ?1", params![item_id])?;
        return Ok(());
    }
    let holes = vec!["?"; account_ids.len()].join(",");
    let mut args: Vec<String> = vec![item_id.clone()];
    args.extend(account_ids.iter().cloned());
    conn.execute(
        &format!("DELETE FROM item_targets WHERE item_id = ?1 AND account_id NOT IN ({holes})"),
        params_from_iter(args.iter()),
    )?;
    for account_id in &account_ids {
        conn.execute(
            "INSERT OR IGNORE INTO item_targets (id, item_id, account_id, status)
             VALUES (?1, ?2, ?3, 'queued')",
            params![uuid::Uuid::new_v4().to_string(), item_id, account_id],
        )?;
    }
    Ok(())
}

/// Mark one target delivered (or failed). The item flips to 'published' once
/// nothing is queued on it any more.
#[tauri::command]
pub fn set_target_status(
    state: State<AppState>,
    item_id: String,
    account_id: String,
    status: String,
    external_url: Option<String>,
    error: Option<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let posted_at = if status == "posted" { Some(now()) } else { None };
    conn.execute(
        "UPDATE item_targets
            SET status = ?3, posted_at = ?4, external_url = ?5, error = ?6
          WHERE item_id = ?1 AND account_id = ?2",
        params![item_id, account_id, status, posted_at, external_url, error],
    )?;

    let queued: i64 = conn.query_row(
        "SELECT COUNT(*) FROM item_targets WHERE item_id = ?1 AND status = 'queued'",
        params![item_id],
        |r| r.get(0),
    )?;
    let failed: i64 = conn.query_row(
        "SELECT COUNT(*) FROM item_targets WHERE item_id = ?1 AND status = 'failed'",
        params![item_id],
        |r| r.get(0),
    )?;
    if queued == 0 {
        let next = if failed > 0 { "failed" } else { "published" };
        conn.execute(
            "UPDATE content_items SET status = ?2, updated_at = ?3, sync_status = 'local'
              WHERE id = ?1",
            params![item_id, next, now()],
        )?;
    }
    Ok(())
}
