pub mod accounts;
pub mod assets;
pub mod content_variants;
pub mod core_ideas;
pub mod folders;
pub mod items;
pub mod projects;
pub mod schedule;
pub mod search;
pub mod seed;

use std::sync::Mutex;

use chrono::Utc;
use rusqlite::Connection;

/// Shared app state: a single SQLite connection behind a mutex.
/// SQLite is fine single-connection for a local-first desktop app.
pub struct AppState {
    pub db: Mutex<Connection>,
}

/// Error type returned to the frontend. Serializes to a plain string so
/// `invoke()` rejects with a readable message.
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("serialization error: {0}")]
    Serde(#[from] serde_json::Error),
    #[error("io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;

/// ISO-8601 UTC timestamp string, used everywhere for created/updated/etc.
pub fn now() -> String {
    Utc::now().to_rfc3339()
}

/// Patch fields are `Option<Option<T>>`: absent = leave alone, `null` = clear.
/// Serde folds both onto `None` by default, which loses the difference — this
/// keeps it. Use with `#[serde(default, deserialize_with = "double_option")]`.
pub fn double_option<'de, T, D>(deserializer: D) -> Result<Option<Option<T>>, D::Error>
where
    T: serde::Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    serde::Deserialize::deserialize(deserializer).map(Some)
}

/// Open the database at `path`, apply migrations, and seed default projects.
pub fn init(path: &std::path::Path) -> AppResult<Connection> {
    let conn = Connection::open(path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    migrate(&conn)?;
    seed_projects(&conn)?;
    seed::seed_if_empty(&conn)?;
    Ok(conn)
}

/// Migrations run in order, tracked by `PRAGMA user_version`. 0001 and 0002 are
/// written with `IF NOT EXISTS` and were shipped before versioning existed, so
/// they stay unconditional; everything from 0003 on uses ALTER TABLE and must
/// run exactly once.
const MIGRATIONS: [&str; 1] = [include_str!("migrations/0003_projects_accounts_scheduling.sql")];

fn migrate(conn: &Connection) -> AppResult<()> {
    conn.execute_batch(include_str!("migrations/0001_init.sql"))?;
    conn.execute_batch(include_str!("migrations/0002_content_items.sql"))?;

    // Versions 1 and 2 are the two batches above; MIGRATIONS[0] is version 3.
    let applied: i64 = conn.query_row("PRAGMA user_version", [], |r| r.get(0))?;
    let mut version = applied.max(2);
    for (i, sql) in MIGRATIONS.iter().enumerate() {
        let v = i as i64 + 3;
        if v <= version {
            continue;
        }
        conn.execute_batch(sql)?;
        version = v;
    }
    if version != applied {
        conn.pragma_update(None, "user_version", version)?;
    }
    Ok(())
}

/// Seed the founder's fixed set of projects once (idempotent by name).
fn seed_projects(conn: &Connection) -> AppResult<()> {
    let existing: i64 =
        conn.query_row("SELECT COUNT(*) FROM projects WHERE deleted_at IS NULL", [], |r| {
            r.get(0)
        })?;
    if existing > 0 {
        return Ok(());
    }

    let seeds: [(&str, Option<&str>, bool); 3] = [
        ("mysocial", Some("The scheduler itself"), false),
        ("Fretbase", Some("Guitar practice app"), false),
        ("Personal brand", Some("Founder presence"), true),
    ];

    let ts = now();
    for (name, description, is_personal) in seeds {
        conn.execute(
            "INSERT INTO projects (id, name, description, is_personal, created_at, updated_at, sync_status)
             VALUES (?1, ?2, ?3, ?4, ?5, ?5, 'local')",
            rusqlite::params![
                uuid::Uuid::new_v4().to_string(),
                name,
                description,
                is_personal as i32,
                ts,
            ],
        )?;
    }
    Ok(())
}
