use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};

use super::schedule::QueueTarget;
use super::{now, AppError, AppResult, AppState};

const IMAGE_EXTS: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "heic"];

#[derive(Debug, Serialize)]
pub struct ContentItem {
    pub id: String,
    pub project_id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub platform: Option<String>,
    pub body: Option<String>,
    pub status: String,
    /// Dead since migration 0003 — read `scheduled_for` instead.
    pub scheduled_at: Option<String>,
    pub scheduled_for: Option<String>,
    pub timezone: Option<String>,
    pub order_index: i64,
    /// Number of attached files (carousel page count).
    pub asset_count: i64,
    /// Relative path of the first asset, for a grid thumbnail.
    pub cover_path: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl ContentItem {
    fn from_row(row: &Row) -> rusqlite::Result<ContentItem> {
        Ok(ContentItem {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            folder_id: row.get("folder_id")?,
            title: row.get("title")?,
            kind: row.get("kind")?,
            platform: row.get("platform")?,
            body: row.get("body")?,
            status: row.get("status")?,
            scheduled_at: row.get("scheduled_at")?,
            scheduled_for: row.get("scheduled_for")?,
            timezone: row.get("timezone")?,
            order_index: row.get("order_index")?,
            asset_count: row.get("asset_count")?,
            cover_path: row.get("cover_path")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

// Item projection includes a live asset count and cover path so the grid can
// render carousels without an extra round-trip per card.
const SELECT: &str = "SELECT i.id, i.project_id, i.folder_id, i.title, i.kind, i.platform, i.body,
        i.status, i.scheduled_at, i.scheduled_for, i.timezone,
        i.order_index, i.created_at, i.updated_at,
        (SELECT COUNT(*) FROM item_assets a WHERE a.item_id = i.id AND a.deleted_at IS NULL) AS asset_count,
        (SELECT a.file_path FROM item_assets a WHERE a.item_id = i.id AND a.deleted_at IS NULL
            ORDER BY a.order_index ASC LIMIT 1) AS cover_path
     FROM content_items i";

fn fetch(conn: &Connection, id: &str) -> AppResult<ContentItem> {
    conn.query_row(
        &format!("{SELECT} WHERE i.id = ?1 AND i.deleted_at IS NULL"),
        params![id],
        ContentItem::from_row,
    )
    .map_err(AppError::from)
}

#[derive(Debug, Serialize)]
pub struct ItemAsset {
    pub id: String,
    pub item_id: String,
    /// Which part the image hangs off — slide 3, or tweet 2 of a thread.
    pub part_id: Option<String>,
    pub file_path: String,
    pub order_index: i64,
    pub alt_text: Option<String>,
}

impl ItemAsset {
    fn from_row(row: &Row) -> rusqlite::Result<ItemAsset> {
        Ok(ItemAsset {
            id: row.get("id")?,
            item_id: row.get("item_id")?,
            part_id: row.get("part_id")?,
            file_path: row.get("file_path")?,
            order_index: row.get("order_index")?,
            alt_text: row.get("alt_text")?,
        })
    }
}

fn assets_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("app data dir: {e}")))?
        .join("assets");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn is_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| IMAGE_EXTS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

/// Copy a source file into the app data dir and insert an item_assets row.
fn attach_file(
    app: &AppHandle,
    conn: &Connection,
    item_id: &str,
    source: &Path,
) -> AppResult<()> {
    if !source.is_file() {
        return Err(AppError::Other(format!("not a file: {}", source.display())));
    }
    let aid = uuid::Uuid::new_v4().to_string();
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let stored = format!("{aid}{ext}");
    std::fs::copy(source, assets_dir(app)?.join(&stored))?;
    let rel = format!("assets/{stored}");

    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM item_assets
             WHERE item_id = ?1 AND deleted_at IS NULL",
            params![item_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let ts = now();
    conn.execute(
        "INSERT INTO item_assets (id, item_id, file_path, order_index, alt_text, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, NULL, ?5, ?5, 'local')",
        params![aid, item_id, rel, next_order, ts],
    )?;
    Ok(())
}

fn insert_item(
    conn: &Connection,
    project_id: &str,
    folder_id: Option<&str>,
    title: &str,
    kind: &str,
) -> AppResult<String> {
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM content_items
             WHERE project_id = ?1 AND folder_id IS ?2 AND deleted_at IS NULL",
            params![project_id, folder_id],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO content_items
            (id, project_id, folder_id, title, kind, status, order_index, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'idea', ?6, ?7, ?7, 'local')",
        params![id, project_id, folder_id, title, kind, next_order, ts],
    )?;
    Ok(id)
}

/// Create an item and its first part. Everything has at least one part — a
/// `post` has exactly one, a `thread` grows more.
#[tauri::command]
pub fn create_item(
    state: State<AppState>,
    project_id: String,
    folder_id: Option<String>,
    title: String,
    kind: Option<String>,
    body: Option<String>,
    status: Option<String>,
) -> AppResult<ContentItem> {
    let conn = state.db.lock().unwrap();
    let kind = kind.unwrap_or_else(|| "note".into());
    let id = insert_item(&conn, &project_id, folder_id.as_deref(), &title, &kind)?;
    let ts = now();
    conn.execute(
        "UPDATE content_items SET body = ?2, status = ?3, updated_at = ?4 WHERE id = ?1",
        params![
            id,
            body,
            status.unwrap_or_else(|| "idea".into()),
            ts
        ],
    )?;
    conn.execute(
        "INSERT INTO item_parts (id, item_id, order_index, body, created_at, updated_at)
         VALUES (?1, ?2, 0, ?3, ?4, ?4)",
        params![
            uuid::Uuid::new_v4().to_string(),
            id,
            body.unwrap_or_default(),
            ts
        ],
    )?;
    fetch(&conn, &id)
}

/// All live items for a project (or across all projects when `project_id` is
/// None). The Library filters by folder client-side; the Calendar filters to
/// scheduled items. Local scale makes returning the full set the simplest path.
#[tauri::command]
pub fn list_items(state: State<AppState>, project_id: Option<String>) -> AppResult<Vec<ContentItem>> {
    let conn = state.db.lock().unwrap();
    let rows = match project_id {
        Some(pid) => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE i.deleted_at IS NULL AND i.project_id = ?1
                 ORDER BY i.order_index ASC, i.updated_at DESC"
            ))?;
            // Bind to a local so the mapped-rows temporary drops before `stmt`.
            let out = stmt
                .query_map(params![pid], ContentItem::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
        None => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE i.deleted_at IS NULL ORDER BY i.order_index ASC, i.updated_at DESC"
            ))?;
            let out = stmt
                .query_map([], ContentItem::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
    };
    Ok(rows)
}

#[tauri::command]
pub fn get_item(state: State<AppState>, id: String) -> AppResult<ContentItem> {
    let conn = state.db.lock().unwrap();
    fetch(&conn, &id)
}

// Double Option lets a patch distinguish "leave unchanged" (None) from
// "clear to NULL" (Some(None)).
#[derive(Debug, Deserialize)]
pub struct ItemPatch {
    pub title: Option<String>,
    pub kind: Option<String>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub body: Option<Option<String>>,
    pub status: Option<String>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub scheduled_for: Option<Option<String>>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub timezone: Option<Option<String>>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub folder_id: Option<Option<String>>,
    pub order_index: Option<i64>,
}

#[tauri::command]
pub fn update_item(state: State<AppState>, id: String, patch: ItemPatch) -> AppResult<ContentItem> {
    let conn = state.db.lock().unwrap();
    let cur = fetch(&conn, &id)?;

    let title = patch.title.unwrap_or(cur.title);
    let kind = patch.kind.unwrap_or(cur.kind);
    let body = match patch.body {
        Some(v) => v,
        None => cur.body,
    };
    let scheduled_for = match patch.scheduled_for {
        Some(v) => v,
        None => cur.scheduled_for,
    };
    let timezone = match patch.timezone {
        Some(v) => v,
        None => cur.timezone,
    };
    let folder_id = match patch.folder_id {
        Some(v) => v,
        None => cur.folder_id,
    };
    let order_index = patch.order_index.unwrap_or(cur.order_index);

    // Time and status stay consistent: giving a published-or-not item a time
    // schedules it; taking the time away drops it back to a draft.
    let status = match patch.status {
        Some(s) => s,
        None => match (cur.status.as_str(), &scheduled_for) {
            ("published", _) | ("failed", _) => cur.status,
            (_, Some(_)) => "scheduled".to_string(),
            ("scheduled", None) => "draft".to_string(),
            _ => cur.status,
        },
    };

    conn.execute(
        "UPDATE content_items
         SET title = ?2, kind = ?3, body = ?4, status = ?5,
             scheduled_for = ?6, timezone = ?7, folder_id = ?8, order_index = ?9,
             updated_at = ?10, sync_status = 'local'
         WHERE id = ?1",
        params![
            id, title, kind, body, status, scheduled_for, timezone, folder_id, order_index, now()
        ],
    )?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn delete_item(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE content_items SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_item_assets(state: State<AppState>, item_id: String) -> AppResult<Vec<ItemAsset>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, item_id, part_id, file_path, order_index, alt_text FROM item_assets
         WHERE item_id = ?1 AND deleted_at IS NULL ORDER BY order_index ASC",
    )?;
    let rows = stmt
        .query_map(params![item_id], ItemAsset::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn add_item_asset(
    app: AppHandle,
    state: State<AppState>,
    item_id: String,
    source_path: String,
    part_id: Option<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    attach_file(&app, &conn, &item_id, &PathBuf::from(source_path))?;
    if let Some(part_id) = part_id {
        // The row we just wrote is the newest one for this item.
        conn.execute(
            "UPDATE item_assets SET part_id = ?2
              WHERE id = (SELECT id FROM item_assets WHERE item_id = ?1 AND deleted_at IS NULL
                           ORDER BY created_at DESC, order_index DESC LIMIT 1)",
            params![item_id, part_id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn remove_item_asset(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE item_assets SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(())
}

/// Import dropped or picked paths into a folder.
///   - Each directory becomes one carousel item; its images (sorted by name)
///     become the ordered pages.
///   - All loose image files in the batch are grouped into a single carousel.
/// Returns the created items so the UI can refresh and reveal them.
#[tauri::command]
pub fn import_paths(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    folder_id: Option<String>,
    paths: Vec<String>,
) -> AppResult<Vec<ContentItem>> {
    let conn = state.db.lock().unwrap();
    let mut created: Vec<ContentItem> = Vec::new();
    let mut loose: Vec<PathBuf> = Vec::new();

    for p in &paths {
        let path = PathBuf::from(p);
        if path.is_dir() {
            let mut images: Vec<PathBuf> = std::fs::read_dir(&path)?
                .filter_map(|e| e.ok().map(|e| e.path()))
                .filter(|p| is_image(p))
                .collect();
            images.sort();
            if images.is_empty() {
                continue;
            }
            let name = path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("Imported carousel")
                .to_string();
            let id = insert_item(&conn, &project_id, folder_id.as_deref(), &name, "carousel")?;
            for img in &images {
                attach_file(&app, &conn, &id, img)?;
            }
            created.push(fetch(&conn, &id)?);
        } else if is_image(&path) {
            loose.push(path);
        }
    }

    if !loose.is_empty() {
        loose.sort();
        let (title, kind) = if loose.len() == 1 {
            (
                loose[0]
                    .file_stem()
                    .and_then(|n| n.to_str())
                    .unwrap_or("Image")
                    .to_string(),
                "image",
            )
        } else {
            ("Imported carousel".to_string(), "carousel")
        };
        let id = insert_item(&conn, &project_id, folder_id.as_deref(), &title, kind)?;
        for img in &loose {
            attach_file(&app, &conn, &id, img)?;
        }
        created.push(fetch(&conn, &id)?);
    }

    Ok(created)
}

// ── Parts ───────────────────────────────────────────────────────────────────
// A thread is an ordered list of parts; a carousel is an ordered list of slides.
// Same table, same editor.

#[derive(Debug, Serialize)]
pub struct ItemPart {
    pub id: String,
    pub item_id: String,
    pub order_index: i64,
    pub body: String,
    pub created_at: String,
    pub updated_at: String,
}

impl ItemPart {
    fn from_row(row: &Row) -> rusqlite::Result<ItemPart> {
        Ok(ItemPart {
            id: row.get("id")?,
            item_id: row.get("item_id")?,
            order_index: row.get("order_index")?,
            body: row.get("body")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[tauri::command]
pub fn list_item_parts(state: State<AppState>, item_id: String) -> AppResult<Vec<ItemPart>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, item_id, order_index, body, created_at, updated_at FROM item_parts
          WHERE item_id = ?1 ORDER BY order_index ASC",
    )?;
    let rows = stmt
        .query_map(params![item_id], ItemPart::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

fn fetch_part(conn: &Connection, id: &str) -> AppResult<ItemPart> {
    conn.query_row(
        "SELECT id, item_id, order_index, body, created_at, updated_at FROM item_parts WHERE id = ?1",
        params![id],
        ItemPart::from_row,
    )
    .map_err(AppError::from)
}

/// Insert or update one part. `part_id = None` appends a new one. The item's
/// `body` column is kept in sync with part 1 so list rows stay cheap to read.
#[tauri::command]
pub fn upsert_item_part(
    state: State<AppState>,
    item_id: String,
    part_id: Option<String>,
    order_index: Option<i64>,
    body: String,
) -> AppResult<ItemPart> {
    let conn = state.db.lock().unwrap();
    let ts = now();
    let id = match part_id {
        Some(pid) => {
            conn.execute(
                "UPDATE item_parts SET body = ?2, order_index = COALESCE(?3, order_index),
                        updated_at = ?4
                  WHERE id = ?1",
                params![pid, body, order_index, ts],
            )?;
            pid
        }
        None => {
            let pid = uuid::Uuid::new_v4().to_string();
            let next: i64 = order_index.unwrap_or_else(|| {
                conn.query_row(
                    "SELECT COALESCE(MAX(order_index) + 1, 0) FROM item_parts WHERE item_id = ?1",
                    params![item_id],
                    |r| r.get(0),
                )
                .unwrap_or(0)
            });
            conn.execute(
                "INSERT INTO item_parts (id, item_id, order_index, body, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
                params![pid, item_id, next, body, ts],
            )?;
            pid
        }
    };
    sync_body(&conn, &item_id, &ts)?;
    fetch_part(&conn, &id)
}

#[tauri::command]
pub fn delete_item_part(state: State<AppState>, part_id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let item_id: String = conn.query_row(
        "SELECT item_id FROM item_parts WHERE id = ?1",
        params![part_id],
        |r| r.get(0),
    )?;
    conn.execute("DELETE FROM item_parts WHERE id = ?1", params![part_id])?;
    // Close the gap so `2 / 5` labels stay honest.
    let ids: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT id FROM item_parts WHERE item_id = ?1 ORDER BY order_index ASC",
        )?;
        let out = stmt
            .query_map(params![item_id], |r| r.get(0))?
            .collect::<rusqlite::Result<Vec<String>>>()?;
        out
    };
    for (i, id) in ids.iter().enumerate() {
        conn.execute(
            "UPDATE item_parts SET order_index = ?2 WHERE id = ?1",
            params![id, i as i64],
        )?;
    }
    sync_body(&conn, &item_id, &now())?;
    Ok(())
}

#[tauri::command]
pub fn reorder_item_parts(
    state: State<AppState>,
    item_id: String,
    ordered_ids: Vec<String>,
) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    for (i, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE item_parts SET order_index = ?2, updated_at = ?3 WHERE id = ?1 AND item_id = ?4",
            params![id, i as i64, now(), item_id],
        )?;
    }
    sync_body(&conn, &item_id, &now())?;
    Ok(())
}

/// Mirror part 1 into `content_items.body`, which every list projection reads.
fn sync_body(conn: &Connection, item_id: &str, ts: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE content_items
            SET body = (SELECT body FROM item_parts WHERE item_id = ?1 ORDER BY order_index ASC LIMIT 1),
                updated_at = ?2, sync_status = 'local'
          WHERE id = ?1",
        params![item_id, ts],
    )?;
    Ok(())
}

// ── Library ─────────────────────────────────────────────────────────────────

/// A library tile. `assets` carries enough paths for the media frame, and
/// `targets` supplies the caption row's avatar and handle.
#[derive(Debug, Serialize)]
pub struct LibraryItem {
    pub id: String,
    pub project_id: String,
    pub folder_id: Option<String>,
    pub title: String,
    pub kind: String,
    pub status: String,
    pub body: Option<String>,
    pub scheduled_for: Option<String>,
    pub part_count: i64,
    pub asset_count: i64,
    pub assets: Vec<String>,
    pub targets: Vec<QueueTarget>,
    pub created_at: String,
    pub updated_at: String,
}

/// Everything in a project, newest first, optionally narrowed to one kind and a
/// free-text query over title and body.
#[tauri::command]
pub fn list_library(
    state: State<AppState>,
    project_id: Option<String>,
    kind_filter: Option<String>,
    query: Option<String>,
) -> AppResult<Vec<LibraryItem>> {
    let conn = state.db.lock().unwrap();
    let like = query
        .as_deref()
        .map(str::trim)
        .filter(|q| !q.is_empty())
        .map(|q| format!("%{q}%"));

    let mut stmt = conn.prepare(
        "SELECT i.id, i.project_id, i.folder_id, i.title, i.kind, i.status,
                i.scheduled_for, i.created_at, i.updated_at,
                COALESCE((SELECT p.body FROM item_parts p WHERE p.item_id = i.id
                           ORDER BY p.order_index ASC LIMIT 1), i.body) AS body,
                (SELECT COUNT(*) FROM item_parts p WHERE p.item_id = i.id) AS part_count,
                (SELECT COUNT(*) FROM item_assets a WHERE a.item_id = i.id AND a.deleted_at IS NULL)
                    AS asset_count
           FROM content_items i
          WHERE i.deleted_at IS NULL
            AND (?1 IS NULL OR i.project_id = ?1)
            AND (?2 IS NULL OR i.kind = ?2)
            AND (?3 IS NULL OR i.title LIKE ?3 OR i.body LIKE ?3)
          ORDER BY i.created_at DESC, i.updated_at DESC",
    )?;
    let mut items = stmt
        .query_map(params![project_id, kind_filter, like], |row| {
            Ok(LibraryItem {
                id: row.get("id")?,
                project_id: row.get("project_id")?,
                folder_id: row.get("folder_id")?,
                title: row.get("title")?,
                kind: row.get("kind")?,
                status: row.get("status")?,
                body: row.get("body")?,
                scheduled_for: row.get("scheduled_for")?,
                part_count: row.get("part_count")?,
                asset_count: row.get("asset_count")?,
                assets: Vec::new(),
                targets: Vec::new(),
                created_at: row.get("created_at")?,
                updated_at: row.get("updated_at")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    drop(stmt);

    let ids: Vec<String> = items.iter().map(|i| i.id.clone()).collect();
    for (item_id, target) in super::schedule::targets_for(&conn, &ids)? {
        if let Some(i) = items.iter_mut().find(|i| i.id == item_id) {
            i.targets.push(target);
        }
    }
    for (item_id, path) in super::schedule::assets_for(&conn, &ids)? {
        if let Some(i) = items.iter_mut().find(|i| i.id == item_id) {
            i.assets.push(path);
        }
    }
    Ok(items)
}

/// Counts per kind for the filter chips, plus `all`.
#[tauri::command]
pub fn library_counts(
    state: State<AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<(String, i64)>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT kind, COUNT(*) FROM content_items
          WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)
          GROUP BY kind",
    )?;
    let rows = stmt
        .query_map(params![project_id], |r| Ok((r.get(0)?, r.get(1)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Counts for the sidebar smart lists, as `(list, count)` pairs.
#[tauri::command]
pub fn smart_list_counts(
    state: State<AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<(String, i64)>> {
    let conn = state.db.lock().unwrap();
    let mut out = Vec::new();
    let scoped = |sql: &str| -> AppResult<i64> {
        Ok(conn.query_row(sql, params![project_id], |r| r.get(0))?)
    };
    out.push((
        "queue".to_string(),
        scoped(
            "SELECT COUNT(*) FROM content_items
              WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)
                AND status = 'scheduled'",
        )?,
    ));
    out.push((
        "library".to_string(),
        scoped(
            "SELECT COUNT(*) FROM content_items
              WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)",
        )?,
    ));
    out.push((
        "notes".to_string(),
        scoped(
            "SELECT COUNT(*) FROM content_items
              WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)
                AND (kind = 'note' OR status = 'idea')",
        )?,
    ));
    out.push((
        "drafts".to_string(),
        scoped(
            "SELECT COUNT(*) FROM content_items
              WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)
                AND status = 'draft'",
        )?,
    ));
    out.push((
        "published".to_string(),
        scoped(
            "SELECT COUNT(*) FROM content_items
              WHERE deleted_at IS NULL AND (?1 IS NULL OR project_id = ?1)
                AND status = 'published'",
        )?,
    ));
    Ok(out)
}

/// Duplicate an item with its parts and asset rows — the Library inspector's
/// "Duplicate". The copy is always an unscheduled draft.
#[tauri::command]
pub fn duplicate_item(state: State<AppState>, id: String) -> AppResult<ContentItem> {
    let conn = state.db.lock().unwrap();
    let src = fetch(&conn, &id)?;
    let new_id = insert_item(
        &conn,
        &src.project_id,
        src.folder_id.as_deref(),
        &format!("{} copy", src.title),
        &src.kind,
    )?;
    let ts = now();
    conn.execute(
        "UPDATE content_items SET body = ?2, status = 'draft', updated_at = ?3 WHERE id = ?1",
        params![new_id, src.body, ts],
    )?;
    conn.execute(
        "INSERT INTO item_parts (id, item_id, order_index, body, created_at, updated_at)
         SELECT lower(hex(randomblob(16))), ?2, order_index, body, ?3, ?3
           FROM item_parts WHERE item_id = ?1",
        params![id, new_id, ts],
    )?;
    conn.execute(
        "INSERT INTO item_assets
            (id, item_id, file_path, order_index, alt_text, created_at, updated_at, sync_status)
         SELECT lower(hex(randomblob(16))), ?2, file_path, order_index, alt_text, ?3, ?3, 'local'
           FROM item_assets WHERE item_id = ?1 AND deleted_at IS NULL",
        params![id, new_id, ts],
    )?;
    fetch(&conn, &new_id)
}

/// Absolute paths of an item's files, for "reveal in Finder" at delivery time.
pub fn asset_paths(conn: &Connection, item_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT file_path FROM item_assets WHERE item_id = ?1 AND deleted_at IS NULL
          ORDER BY order_index ASC",
    )?;
    let rows = stmt
        .query_map(params![item_id], |r| r.get(0))?
        .collect::<rusqlite::Result<Vec<String>>>()?;
    Ok(rows)
}

/// Full text of an item, parts joined — what "Copy post" puts on the clipboard.
pub fn full_text(conn: &Connection, item_id: &str) -> AppResult<String> {
    let mut stmt = conn.prepare(
        "SELECT body FROM item_parts WHERE item_id = ?1 ORDER BY order_index ASC",
    )?;
    let parts = stmt
        .query_map(params![item_id], |r| r.get::<_, String>(0))?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    if parts.is_empty() {
        let body: Option<String> = conn
            .query_row(
                "SELECT body FROM content_items WHERE id = ?1",
                params![item_id],
                |r| r.get(0),
            )
            .unwrap_or(None);
        return Ok(body.unwrap_or_default());
    }
    Ok(parts.join("\n\n"))
}
