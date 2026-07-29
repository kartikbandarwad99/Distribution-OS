use rusqlite::{params, Connection, Row};
use serde::Serialize;
use tauri::State;

use super::{now, AppError, AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct Folder {
    pub id: String,
    pub project_id: String,
    pub parent_id: Option<String>,
    pub name: String,
    pub order_index: i64,
    pub created_at: String,
    pub updated_at: String,
}

impl Folder {
    fn from_row(row: &Row) -> rusqlite::Result<Folder> {
        Ok(Folder {
            id: row.get("id")?,
            project_id: row.get("project_id")?,
            parent_id: row.get("parent_id")?,
            name: row.get("name")?,
            order_index: row.get("order_index")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }
}

const SELECT: &str = "SELECT id, project_id, parent_id, name, order_index, created_at, updated_at
                      FROM folders";

fn fetch(conn: &Connection, id: &str) -> AppResult<Folder> {
    conn.query_row(
        &format!("{SELECT} WHERE id = ?1 AND deleted_at IS NULL"),
        params![id],
        Folder::from_row,
    )
    .map_err(AppError::from)
}

#[tauri::command]
pub fn create_folder(
    state: State<AppState>,
    project_id: String,
    parent_id: Option<String>,
    name: String,
) -> AppResult<Folder> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let ts = now();
    // Append after existing siblings so new folders land at the bottom.
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM folders
             WHERE project_id = ?1 AND parent_id IS ?2 AND deleted_at IS NULL",
            params![project_id, parent_id],
            |r| r.get(0),
        )
        .unwrap_or(0);

    conn.execute(
        "INSERT INTO folders (id, project_id, parent_id, name, order_index, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6, 'local')",
        params![id, project_id, parent_id, name, next_order, ts],
    )?;
    fetch(&conn, &id)
}

#[tauri::command]
pub fn list_folders(state: State<AppState>, project_id: Option<String>) -> AppResult<Vec<Folder>> {
    let conn = state.db.lock().unwrap();
    let rows = match project_id {
        Some(pid) => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE deleted_at IS NULL AND project_id = ?1 ORDER BY order_index ASC, name ASC"
            ))?;
            // Bind to a local so the mapped-rows temporary drops before `stmt`.
            let out = stmt
                .query_map(params![pid], Folder::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
        None => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE deleted_at IS NULL ORDER BY order_index ASC, name ASC"
            ))?;
            let out = stmt
                .query_map([], Folder::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
    };
    Ok(rows)
}

#[tauri::command]
pub fn rename_folder(state: State<AppState>, id: String, name: String) -> AppResult<Folder> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE folders SET name = ?2, updated_at = ?3, sync_status = 'local' WHERE id = ?1",
        params![id, name, now()],
    )?;
    fetch(&conn, &id)
}

/// Move a folder under a new parent (or to the top level with `parent_id = None`).
#[tauri::command]
pub fn move_folder(
    state: State<AppState>,
    id: String,
    parent_id: Option<String>,
) -> AppResult<Folder> {
    // Guard against making a folder its own ancestor.
    if let Some(ref pid) = parent_id {
        if pid == &id {
            return Err(AppError::Other("a folder cannot contain itself".into()));
        }
    }
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE folders SET parent_id = ?2, updated_at = ?3, sync_status = 'local' WHERE id = ?1",
        params![id, parent_id, now()],
    )?;
    fetch(&conn, &id)
}

/// Soft-delete a folder and all descendant folders. Items in those folders are
/// preserved and moved to Unfiled (folder_id = NULL) rather than deleted.
#[tauri::command]
pub fn delete_folder(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    let ts = now();

    // Collect the folder and every descendant via a recursive walk.
    let mut ids: Vec<String> = vec![id.clone()];
    let mut frontier: Vec<String> = vec![id];
    while let Some(parent) = frontier.pop() {
        let mut stmt = conn.prepare(
            "SELECT id FROM folders WHERE parent_id = ?1 AND deleted_at IS NULL",
        )?;
        let children: Vec<String> = stmt
            .query_map(params![parent], |r| r.get::<_, String>(0))?
            .collect::<rusqlite::Result<Vec<_>>>()?;
        for c in children {
            ids.push(c.clone());
            frontier.push(c);
        }
    }

    for fid in &ids {
        conn.execute(
            "UPDATE content_items SET folder_id = NULL, updated_at = ?2, sync_status = 'local'
             WHERE folder_id = ?1 AND deleted_at IS NULL",
            params![fid, ts],
        )?;
        conn.execute(
            "UPDATE folders SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
            params![fid, ts],
        )?;
    }
    Ok(())
}
