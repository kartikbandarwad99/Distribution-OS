use rusqlite::Row;
use serde::Serialize;
use tauri::State;

use super::{AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub website: Option<String>,
    pub logo_path: Option<String>,
    pub is_personal: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl Project {
    fn from_row(row: &Row) -> rusqlite::Result<Project> {
        Ok(Project {
            id: row.get("id")?,
            name: row.get("name")?,
            description: row.get("description")?,
            website: row.get("website")?,
            logo_path: row.get("logo_path")?,
            is_personal: row.get::<_, i64>("is_personal")? != 0,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

#[tauri::command]
pub fn list_projects(state: State<AppState>) -> AppResult<Vec<Project>> {
    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id, name, description, website, logo_path, is_personal, created_at, updated_at
         FROM projects
         WHERE deleted_at IS NULL
         ORDER BY is_personal ASC, name ASC",
    )?;
    let rows = stmt
        .query_map([], Project::from_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}

#[tauri::command]
pub fn create_project(
    state: State<AppState>,
    name: String,
    description: Option<String>,
    is_personal: Option<bool>,
) -> AppResult<Project> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let ts = super::now();
    conn.execute(
        "INSERT INTO projects (id, name, description, is_personal, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'local')",
        rusqlite::params![id, name, description, is_personal.unwrap_or(false) as i32, ts],
    )?;
    conn.query_row(
        "SELECT id, name, description, website, logo_path, is_personal, created_at, updated_at
           FROM projects WHERE id = ?1",
        [&id],
        Project::from_row,
    )
    .map_err(Into::into)
}

/// Soft-delete a project. Its content goes with it; accounts linked only to it
/// survive but lose the link, so they simply stop appearing anywhere.
#[tauri::command]
pub fn delete_project(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let ts = super::now();
    conn.execute(
        "UPDATE projects SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        rusqlite::params![id, ts],
    )?;
    conn.execute(
        "UPDATE content_items SET deleted_at = ?2, sync_status = 'local'
          WHERE project_id = ?1 AND deleted_at IS NULL",
        rusqlite::params![id, ts],
    )?;
    conn.execute(
        "DELETE FROM account_projects WHERE project_id = ?1",
        rusqlite::params![id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn update_project(
    state: State<AppState>,
    id: String,
    name: Option<String>,
    description: Option<Option<String>>,
    website: Option<Option<String>>,
    logo_path: Option<Option<String>>,
) -> AppResult<Project> {
    let conn = state.db.lock().unwrap();
    let updated_at = super::now();
    if let Some(value) = name { conn.execute("UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL", rusqlite::params![value, &updated_at, &id])?; }
    if let Some(value) = description { conn.execute("UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL", rusqlite::params![value, &updated_at, &id])?; }
    if let Some(value) = website { conn.execute("UPDATE projects SET website = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL", rusqlite::params![value, &updated_at, &id])?; }
    if let Some(value) = logo_path { conn.execute("UPDATE projects SET logo_path = ?1, updated_at = ?2 WHERE id = ?3 AND deleted_at IS NULL", rusqlite::params![value, &updated_at, &id])?; }
    conn.query_row(
        "SELECT id, name, description, website, logo_path, is_personal, created_at, updated_at FROM projects WHERE id = ?1 AND deleted_at IS NULL",
        [&id],
        Project::from_row,
    ).map_err(Into::into)
}
