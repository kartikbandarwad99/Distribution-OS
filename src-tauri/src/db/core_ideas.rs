use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::{now, AppError, AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct CoreIdea {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub thesis: Option<String>,
    pub tags: Vec<String>,
    pub status: String,
    pub created_at: String,
    pub updated_at: String,
}

impl CoreIdea {
    fn from_row(row: &Row) -> rusqlite::Result<CoreIdea> {
        let tags_json: String = row.get("tags")?;
        let tags: Vec<String> = serde_json::from_str(&tags_json).unwrap_or_default();
        Ok(CoreIdea {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            title: row.get("title")?,
            thesis: row.get("thesis")?,
            tags,
            status: row.get("status")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

const SELECT: &str = "SELECT id, project_id, title, thesis, tags, status, created_at, updated_at
                      FROM core_ideas";

/// Keep the FTS index in sync with an idea row.
fn index_idea(
    conn: &Connection,
    id: &str,
    project_id: &str,
    title: &str,
    thesis: Option<&str>,
    tags: &[String],
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM kb_fts WHERE ref = 'idea' AND ref_id = ?1",
        params![id],
    )?;
    let body = format!("{}\n{}", thesis.unwrap_or(""), tags.join(" "));
    conn.execute(
        "INSERT INTO kb_fts (ref, ref_id, project_id, title, body)
         VALUES ('idea', ?1, ?2, ?3, ?4)",
        params![id, project_id, title, body],
    )?;
    Ok(())
}

fn deindex_idea(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "DELETE FROM kb_fts WHERE ref = 'idea' AND ref_id = ?1",
        params![id],
    )?;
    Ok(())
}

fn fetch(conn: &Connection, id: &str) -> AppResult<CoreIdea> {
    conn.query_row(
        &format!("{SELECT} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        CoreIdea::from_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn create_core_idea(
    state: State<AppState>,
    project_id: String,
    title: String,
    thesis: Option<String>,
    tags: Option<Vec<String>>,
) -> AppResult<CoreIdea> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    let tags = tags.unwrap_or_default();
    let tags_json = serde_json::to_string(&tags)?;

    conn.execute(
        "INSERT INTO core_ideas (id, project_id, title, thesis, tags, status, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'idea', ?6, ?6, 'local')",
        params![id, project_id, title, thesis, tags_json, ts],
    )?;
    index_idea(&conn, &id, &project_id, &title, thesis.as_deref(), &tags)?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn list_core_ideas(
    state: State<AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<CoreIdea>> {
    let conn = state.db.lock().unwrap();
    let rows = match project_id {
        Some(pid) => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE deleted_at IS NULL AND project_id = ?1 ORDER BY updated_at DESC"
            ))?;
            // Bind before the arm ends so `stmt` outlives the mapped rows.
            let out = stmt
                .query_map(params![pid], CoreIdea::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
        None => {
            let mut stmt = conn
                .prepare(&format!("{SELECT} WHERE deleted_at IS NULL ORDER BY updated_at DESC"))?;
            let out = stmt
                .query_map([], CoreIdea::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
    };
    Ok(rows)
}

#[tauri::command]
pub fn get_core_idea(state: State<AppState>, id: String) -> AppResult<CoreIdea> {
    let conn = state.db.lock().unwrap();
    fetch(&conn, &id)
}

#[derive(Debug, Deserialize)]
pub struct CoreIdeaPatch {
    pub title: Option<String>,
    pub thesis: Option<Option<String>>,
    pub tags: Option<Vec<String>>,
    pub status: Option<String>,
}

#[tauri::command]
pub fn update_core_idea(
    state: State<AppState>,
    id: String,
    patch: CoreIdeaPatch,
) -> AppResult<CoreIdea> {
    let conn = state.db.lock().unwrap();
    let current = fetch(&conn, &id)?;

    let title = patch.title.unwrap_or(current.title);
    let thesis = match patch.thesis {
        Some(v) => v,
        None => current.thesis,
    };
    let tags = patch.tags.unwrap_or(current.tags);
    let status = patch.status.unwrap_or(current.status);
    let tags_json = serde_json::to_string(&tags)?;
    let ts = now();

    conn.execute(
        "UPDATE core_ideas
         SET title = ?2, thesis = ?3, tags = ?4, status = ?5, updated_at = ?6, sync_status = 'local'
         WHERE id = ?1",
        params![id, title, thesis, tags_json, status, ts],
    )?;
    index_idea(&conn, &id, &current.project_id, &title, thesis.as_deref(), &tags)?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn delete_core_idea(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let ts = now();
    // Soft-delete the idea and cascade the soft-delete to its variants.
    conn.execute(
        "UPDATE core_ideas SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, ts],
    )?;
    conn.execute(
        "UPDATE content_variants SET deleted_at = ?2, sync_status = 'local'
         WHERE core_idea_id = ?1 AND deleted_at IS NULL",
        params![id, ts],
    )?;
    deindex_idea(&conn, &id)?;
    // Drop variant FTS rows for this idea too.
    conn.execute(
        "DELETE FROM kb_fts WHERE ref = 'variant' AND ref_id IN
            (SELECT id FROM content_variants WHERE core_idea_id = ?1)",
        params![id],
    )?;
    Ok(())
}
