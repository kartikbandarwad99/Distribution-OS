mod db;
mod oauth;
mod publish;

use std::sync::Mutex;

use tauri::Manager;

use db::AppState;
use publish::Announced;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            // Resolve the per-app data dir, ensure it exists, open + migrate the DB.
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("resolve app data dir");
            std::fs::create_dir_all(&data_dir).expect("create app data dir");
            let db_path = data_dir.join("distribution-os.sqlite3");

            let conn = db::init(&db_path).expect("initialize database");
            app.manage(AppState {
                db: Mutex::new(conn),
            });
            app.manage(Announced::default());
            publish::start(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db::projects::list_projects,
            db::projects::create_project,
            db::projects::update_project,
            db::projects::delete_project,
            db::accounts::list_accounts,
            db::accounts::create_account,
            db::accounts::update_account,
            db::accounts::set_account_projects,
            db::accounts::delete_account,
            db::accounts::import_legacy_accounts,
            db::schedule::list_queue,
            db::schedule::next_due,
            db::schedule::schedule_item,
            db::schedule::unschedule_item,
            db::schedule::set_item_targets,
            db::schedule::list_item_targets,
            db::schedule::set_target_status,
            db::seed::seed_demo,
            db::core_ideas::create_core_idea,
            db::core_ideas::list_core_ideas,
            db::core_ideas::get_core_idea,
            db::core_ideas::update_core_idea,
            db::core_ideas::delete_core_idea,
            db::content_variants::create_content_variant,
            db::content_variants::list_content_variants,
            db::content_variants::update_content_variant,
            db::content_variants::delete_content_variant,
            db::assets::add_asset,
            db::assets::list_assets,
            db::assets::asset_abs_path,
            db::assets::remove_asset,
            db::search::search_kb,
            db::folders::create_folder,
            db::folders::list_folders,
            db::folders::rename_folder,
            db::folders::move_folder,
            db::folders::delete_folder,
            db::items::create_item,
            db::items::list_items,
            db::items::get_item,
            db::items::update_item,
            db::items::delete_item,
            db::items::list_item_assets,
            db::items::add_item_asset,
            db::items::remove_item_asset,
            db::items::import_paths,
            db::items::list_item_parts,
            db::items::upsert_item_part,
            db::items::delete_item_part,
            db::items::reorder_item_parts,
            db::items::list_library,
            db::items::library_counts,
            db::items::smart_list_counts,
            db::items::duplicate_item,
            publish::list_due_now,
            publish::item_clipboard_text,
            publish::reveal_item_assets,
            oauth::oauth_connect,
            oauth::oauth_adopt_token,
            oauth::oauth_refresh_token,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
