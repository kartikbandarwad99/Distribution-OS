use rusqlite::params;
use serde::Serialize;
use tauri::State;

use super::{AppResult, AppState};

#[derive(Debug, Serialize)]
pub struct SearchHit {
    pub ref_kind: String, // "idea" | "variant"
    pub ref_id: String,
    pub project_id: String,
    pub title: String,
    pub snippet: String,
    /// For variants, the owning idea id (so the UI can open the editor).
    pub core_idea_id: Option<String>,
}

/// Turn a free-text query into a safe FTS5 MATCH expression with prefix search.
/// Each whitespace token is quoted (so punctuation can't break the parser) and
/// given a trailing `*` for prefix matching.
fn to_match_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split_whitespace()
        .map(|t| t.replace('"', ""))
        .filter(|t| !t.is_empty())
        .map(|t| format!("\"{t}\"*"))
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" AND "))
    }
}

#[tauri::command]
pub fn search_kb(
    state: State<AppState>,
    query: String,
    project_id: Option<String>,
) -> AppResult<Vec<SearchHit>> {
    let match_query = match to_match_query(&query) {
        Some(q) => q,
        None => return Ok(vec![]),
    };

    let conn = state.db.lock().unwrap();

    // snippet() highlights matches; column 4 is `body`, column 3 is `title`.
    let sql = "
        SELECT f.ref AS ref_kind,
               f.ref_id AS ref_id,
               f.project_id AS project_id,
               f.title AS title,
               snippet(kb_fts, 4, '[', ']', ' … ', 12) AS snippet,
               CASE WHEN f.ref = 'variant'
                    THEN (SELECT core_idea_id FROM content_variants WHERE id = f.ref_id)
                    ELSE NULL END AS core_idea_id
        FROM kb_fts f
        WHERE kb_fts MATCH ?1
          AND (?2 IS NULL OR f.project_id = ?2)
        ORDER BY rank
        LIMIT 100";

    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(params![match_query, project_id], |row| {
            Ok(SearchHit {
                ref_kind: row.get("ref_kind")?,
                ref_id: row.get("ref_id")?,
                project_id: row.get("project_id")?,
                title: row.get("title")?,
                snippet: row.get("snippet")?,
                core_idea_id: row.get("core_idea_id")?,
            })
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
