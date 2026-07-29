use rusqlite::{params, Connection, Row};
use serde::{Deserialize, Serialize};
use tauri::State;

use super::{now, AppError, AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct Account {
    pub id: String,
    pub platform: String,
    pub handle: String,
    pub display_name: Option<String>,
    pub avatar_path: Option<String>,
    pub is_global: bool,
    pub connection_status: String,
    pub order_index: i64,
    pub created_at: String,
    pub updated_at: String,
    /// Projects this account is linked to. Empty when `is_global`.
    pub project_ids: Vec<String>,
    /// Targets still waiting to go out — the count in the sidebar row.
    pub pending_count: i64,
}

impl Account {
    fn from_row(row: &Row) -> rusqlite::Result<Account> {
        Ok(Account {
            id: row.get("id")?,
            platform: row.get("platform")?,
            handle: row.get("handle")?,
            display_name: row.get("display_name")?,
            avatar_path: row.get("avatar_path")?,
            is_global: row.get::<_, i64>("is_global")? != 0,
            connection_status: row.get("connection_status")?,
            order_index: row.get("order_index")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            project_ids: row
                .get::<_, Option<String>>("project_ids")?
                .filter(|s| !s.is_empty())
                .map(|s| s.split(',').map(str::to_string).collect())
                .unwrap_or_default(),
            pending_count: row.get("pending_count")?,
        })
    }
}

const SELECT: &str = "SELECT a.id, a.platform, a.handle, a.display_name, a.avatar_path,
        a.is_global, a.connection_status, a.order_index, a.created_at, a.updated_at,
        (SELECT group_concat(ap.project_id) FROM account_projects ap
          WHERE ap.account_id = a.id) AS project_ids,
        (SELECT COUNT(*) FROM item_targets t
            JOIN content_items i ON i.id = t.item_id
          WHERE t.account_id = a.id AND t.status = 'queued' AND i.deleted_at IS NULL)
            AS pending_count
     FROM accounts a";

fn fetch(conn: &Connection, id: &str) -> AppResult<Account> {
    conn.query_row(
        &format!("{SELECT} WHERE a.id = ?1 AND a.deleted_at IS NULL"),
        params![id],
        Account::from_row,
    )
    .map_err(AppError::from)
}

/// Accounts visible in a project: the global ones plus the ones linked to it.
/// `project_id = None` means "All projects" and returns every account.
#[tauri::command]
pub fn list_accounts(
    state: State<AppState>,
    project_id: Option<String>,
) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    list(&conn, project_id.as_deref())
}

pub fn list(conn: &Connection, project_id: Option<&str>) -> AppResult<Vec<Account>> {
    let rows = match project_id {
        Some(pid) => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE a.deleted_at IS NULL
                   AND (a.is_global = 1
                        OR a.id IN (SELECT account_id FROM account_projects WHERE project_id = ?1))
                 ORDER BY a.platform, a.order_index, a.handle"
            ))?;
            let out = stmt
                .query_map(params![pid], Account::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
        None => {
            let mut stmt = conn.prepare(&format!(
                "{SELECT} WHERE a.deleted_at IS NULL
                 ORDER BY a.platform, a.order_index, a.handle"
            ))?;
            let out = stmt
                .query_map([], Account::from_row)?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            out
        }
    };
    Ok(rows)
}

fn write_projects(
    conn: &Connection,
    account_id: &str,
    is_global: bool,
    project_ids: &[String],
) -> AppResult<()> {
    conn.execute(
        "DELETE FROM account_projects WHERE account_id = ?1",
        params![account_id],
    )?;
    // A global account is visible everywhere, so per-project links are noise.
    if is_global {
        return Ok(());
    }
    for pid in project_ids {
        conn.execute(
            "INSERT OR IGNORE INTO account_projects (account_id, project_id) VALUES (?1, ?2)",
            params![account_id, pid],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn create_account(
    state: State<AppState>,
    platform: String,
    handle: String,
    display_name: Option<String>,
    is_global: Option<bool>,
    project_ids: Option<Vec<String>>,
) -> AppResult<Account> {
    let conn = state.db.lock().unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let is_global = is_global.unwrap_or(false);
    let ts = now();
    let next_order: i64 = conn
        .query_row(
            "SELECT COALESCE(MAX(order_index) + 1, 0) FROM accounts
             WHERE platform = ?1 AND deleted_at IS NULL",
            params![platform],
            |r| r.get(0),
        )
        .unwrap_or(0);
    conn.execute(
        "INSERT INTO accounts
            (id, platform, handle, display_name, is_global, connection_status,
             order_index, created_at, updated_at, sync_status)
         VALUES (?1, ?2, ?3, ?4, ?5, 'manual', ?6, ?7, ?7, 'local')",
        params![
            id,
            platform,
            handle,
            display_name,
            is_global as i32,
            next_order,
            ts
        ],
    )?;
    write_projects(&conn, &id, is_global, &project_ids.unwrap_or_default())?;
    fetch(&conn, &id)
}

// Double Option distinguishes "leave unchanged" (None) from "clear" (Some(None)).
#[derive(Debug, Deserialize)]
pub struct AccountPatch {
    pub platform: Option<String>,
    pub handle: Option<String>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub display_name: Option<Option<String>>,
    #[serde(default, deserialize_with = "super::double_option")]
    pub avatar_path: Option<Option<String>>,
    pub is_global: Option<bool>,
    pub connection_status: Option<String>,
    pub order_index: Option<i64>,
}

#[tauri::command]
pub fn update_account(
    state: State<AppState>,
    id: String,
    patch: AccountPatch,
) -> AppResult<Account> {
    let conn = state.db.lock().unwrap();
    let cur = fetch(&conn, &id)?;
    let is_global = patch.is_global.unwrap_or(cur.is_global);
    conn.execute(
        "UPDATE accounts
            SET platform = ?2, handle = ?3, display_name = ?4, avatar_path = ?5,
                is_global = ?6, connection_status = ?7, order_index = ?8,
                updated_at = ?9, sync_status = 'local'
          WHERE id = ?1",
        params![
            id,
            patch.platform.unwrap_or(cur.platform),
            patch.handle.unwrap_or(cur.handle),
            patch.display_name.unwrap_or(cur.display_name),
            patch.avatar_path.unwrap_or(cur.avatar_path),
            is_global as i32,
            patch.connection_status.unwrap_or(cur.connection_status),
            patch.order_index.unwrap_or(cur.order_index),
            now(),
        ],
    )?;
    if is_global {
        conn.execute(
            "DELETE FROM account_projects WHERE account_id = ?1",
            params![id],
        )?;
    }
    fetch(&conn, &id)
}

#[tauri::command]
pub fn set_account_projects(
    state: State<AppState>,
    account_id: String,
    is_global: bool,
    project_ids: Vec<String>,
) -> AppResult<Account> {
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE accounts SET is_global = ?2, updated_at = ?3, sync_status = 'local' WHERE id = ?1",
        params![account_id, is_global as i32, now()],
    )?;
    write_projects(&conn, &account_id, is_global, &project_ids)?;
    fetch(&conn, &account_id)
}

/// Soft-delete the account and hard-delete its targets: a queued target
/// pointing at an account that no longer exists would show up as a ghost row.
#[tauri::command]
pub fn delete_account(state: State<AppState>, id: String) -> AppResult<()> {
    let conn = state.db.lock().unwrap();
    conn.execute("DELETE FROM item_targets WHERE account_id = ?1", params![id])?;
    conn.execute("DELETE FROM account_projects WHERE account_id = ?1", params![id])?;
    conn.execute(
        "UPDATE accounts SET deleted_at = ?2, sync_status = 'local' WHERE id = ?1",
        params![id, now()],
    )?;
    Ok(())
}

/// One-time import of the pre-SQLite localStorage accounts. The frontend reads
/// the old key, hands the rows over once, and then clears it.
#[tauri::command]
pub fn import_legacy_accounts(
    state: State<AppState>,
    accounts: Vec<LegacyAccount>,
) -> AppResult<Vec<Account>> {
    let conn = state.db.lock().unwrap();
    let mut out = Vec::new();
    for legacy in accounts {
        // Same platform + handle already migrated: link the project, skip the insert.
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM accounts
                  WHERE platform = ?1 AND handle = ?2 AND deleted_at IS NULL",
                params![legacy.platform, legacy.handle],
                |r| r.get(0),
            )
            .ok();
        let id = match existing {
            Some(id) => id,
            None => {
                let id = uuid::Uuid::new_v4().to_string();
                let ts = now();
                conn.execute(
                    "INSERT INTO accounts
                        (id, platform, handle, display_name, is_global, connection_status,
                         order_index, created_at, updated_at, sync_status)
                     VALUES (?1, ?2, ?3, ?4, 0, 'manual', 0, ?5, ?5, 'local')",
                    params![id, legacy.platform, legacy.handle, legacy.label, ts],
                )?;
                id
            }
        };
        if let Some(pid) = legacy.project_id.as_deref() {
            conn.execute(
                "INSERT OR IGNORE INTO account_projects (account_id, project_id) VALUES (?1, ?2)",
                params![id, pid],
            )?;
        }
        out.push(fetch(&conn, &id)?);
    }
    Ok(out)
}

#[derive(Debug, Deserialize)]
pub struct LegacyAccount {
    pub platform: String,
    pub handle: String,
    pub label: Option<String>,
    pub project_id: Option<String>,
}
