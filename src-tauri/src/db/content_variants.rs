use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::{now, AppError, AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct ContentVariant {
    pub id: String,
    pub core_idea_id: String,
    pub project_id: String,
    pub platform: String,
    pub kind: String,
    pub title: Option<String>,
    pub body: Option<String>,
    pub status: String,
    pub scheduled_at: Option<String>,
    pub published_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl ContentVariant {
    fn from_row(row: &Row) -> rusqlite::Result<ContentVariant> {
        Ok(ContentVariant {
            id: row.get("id")?,
            core_idea_id: row.get("core_idea_id")?,
            project_id: row.get("project_id")?,
            platform: row.get("platform")?,
            kind: row.get("kind")?,
            title: row.get("title")?,
            body: row.get("body")?,
            status: row.get("status")?,
            scheduled_at: row.get("scheduled_at")?,
            published_at: row.get("published_at")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

const SELECT: &str =
    "SELECT id, core_idea_id, project_id, platform, kind, title, body, status,
            scheduled_at, published_at, created_at, updated_at
     FROM content_variants";

fn index_variant(
    conn: &Connection,
    id: &str,
    project_id: &str,
    title: Option<&str>,
    body: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM kb_fts WHERE ref = 'variant' AND ref_id = ?1",
        params![id],
    )?;
    conn.execute(
        "INSERT INTO kb_fts (ref, ref_id, project_id, title, body)
         VALUES ('variant', ?1, ?2, ?3, ?4)",
        params![id, project_id, title.unwrap_or(""), body.unwrap_or("")],
    )?;
    Ok(())
}

fn fetch(conn: &Connection, id: &str) -> AppResult<ContentVariant> {
    conn.query_row(
        &format!("{SELECT} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        ContentVariant::from_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn create_content_variant(
    state: State<AppState>,
    core_idea_id: String,
    project_id: String,
    platform: String,
    kind: Option<String>,
    title: Option<String>,
    body: Option<String>,
) -> AppResult<ContentVariant> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    let kind = kind.unwrap_or_else(|| "text".to_string());

    conn.execute(
        "INSERT INTO content_variants
            (id, core_idea_id, project_id, platform, kind, title, body, status, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'idea', ?8, ?8, 'local')",
        params![id, core_idea_id, project_id, platform, kind, title, body, ts],
    )?;
    index_variant(&conn, &id, &project_id, title.as_deref(), body.as_deref())?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn list_content_variants(
    state: State<AppState>,
    core_idea_id: String,
) -> AppResult<Vec<ContentVariant>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "{SELECT} WHERE deleted_at IS NULL AND core_idea_id = ?1 ORDER BY created_at ASC"
    ))?;
    let rows = stmt
        .query_map(params![core_idea_id], ContentVariant::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[derive(Debug, Deserialize)]
pub struct VariantPatch {
    pub platform: Option<String>,
    pub kind: Option<String>,
    pub title: Option<Option<String>>,
    pub body: Option<Option<String>>,
    pub status: Option<String>,
    pub scheduled_at: Option<Option<String>>,
}

#[tauri::command]
pub fn update_content_variant(
    state: State<AppState>,
    id: String,
    patch: VariantPatch,
) -> AppResult<ContentVariant> {
    let conn = state.db.lock().unwrap();
    let current = fetch(&conn, &id)?;

    let platform = patch.platform.unwrap_or(current.platform);
    let kind = patch.kind.unwrap_or(current.kind);
    let title = match patch.title {
        Some(v) => v,
        None => current.title,
    };
    let body = match patch.body {
        Some(v) => v,
        None => current.body,
    };
    let status = patch.status.unwrap_or(current.status);
    let scheduled_at = match patch.scheduled_at {
        Some(v) => v,
        None => current.scheduled_at,
    };
    let ts = now();

    conn.execute(
        "UPDATE content_variants
         SET platform = ?2, kind = ?3, title = ?4, body = ?5, status = ?6,
             scheduled_at = ?7, updated_at = ?8, sync_status = 'local'
         WHERE id = ?1",
        params![id, platform, kind, title, body, status, scheduled_at, ts],
    )?;
    index_variant(&conn, &id, &current.project_id, title.as_deref(), body.as_deref())?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn delete_content_variant(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let ts = now();
    conn.execute(
        "UPDATE content_variants SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, ts],
    )?;
    conn.execute(
        "DELETE FROM kb_fts WHERE ref = 'variant' AND ref_id = ?1",
        params![id],
    )?;
    Ok(())
}
