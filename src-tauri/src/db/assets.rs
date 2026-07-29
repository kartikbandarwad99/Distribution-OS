use std::path::PathBuf;

use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use super::{now, AppError, AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct Asset {
    pub id: String,
    pub project_id: String,
    pub variant_id: Option<String>,
    pub kind: String,
    pub file_path: String, // path relative to the app data dir
    pub order_index: i64,
    pub alt_text: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl Asset {
    fn from_row(row: &Row) -> rusqlite::Result<Asset> {
        Ok(Asset {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            variant_id: row.get("variant_id")?,
            kind: row.get("kind")?,
            file_path: row.get("file_path")?,
            order_index: row.get("order_index")?,
            alt_text: row.get("alt_text")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

const SELECT: &str = "SELECT id, project_id, variant_id, kind, file_path, order_index,
                             alt_text, created_at, updated_at
                      FROM assets";

fn assets_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("app data dir: {e}")))?
        .join("assets");
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn fetch(conn: &Connection, id: &str) -> AppResult<Asset> {
    conn.query_row(
        &format!("{SELECT} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        Asset::from_row,
    )
    .map_err(AppError::from)
}

/// Copy an on-disk file into the app data dir and record it as an asset.
#[tauri::command]
pub fn add_asset(
    app: AppHandle,
    state: State<AppState>,
    project_id: String,
    variant_id: Option<String>,
    kind: String,
    source_path: String,
    alt_text: Option<String>,
) -> AppResult<Asset> {
    let src = PathBuf::from(&source_path);
    if !src.is_file() {
        return Err(AppError::Other(format!("not a file: {source_path}")));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| format!(".{e}"))
        .unwrap_or_default();
    let stored_name = format!("{id}{ext}");

    let dir = assets_dir(&app)?;
    std::fs::copy(&src, dir.join(&stored_name))?;
    let rel_path = format!("assets/{stored_name}");

    let conn = state.db.lock().unwrap();
    // Append to the end of the carousel/order for this variant.
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM assets
             WHERE variant_id IS ?1 AND deleted_at IS NULL",
            params![variant_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    let ts = now();
    conn.execute(
        "INSERT INTO assets
            (id, project_id, variant_id, kind, file_path, order_index, alt_text, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8, 'local')",
        params![id, project_id, variant_id, kind, rel_path, next_order, alt_text, ts],
    )?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn list_assets(state: State<AppState>, variant_id: String) -> AppResult<Vec<Asset>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE deleted_at IS NULL AND variant_id = ?1 ORDER BY order_index ASC"
    ))?;
    let rows = stmt
        .query_map(params![variant_id], Asset::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

/// Return an absolute filesystem path for an asset so the UI can display it
/// via `convertFileSrc`.
#[tauri::command]
pub fn asset_abs_path(app: AppHandle, file_path: String) -> AppResult<String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::Other(format!("app data dir: {e}")))?;
    Ok(base.join(file_path).to_string_lossy().to_string())
}

#[tauri::command]
pub fn remove_asset(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let ts = now();
    conn.execute(
        "UPDATE assets SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, ts],
    )?;
    Ok(())
}
