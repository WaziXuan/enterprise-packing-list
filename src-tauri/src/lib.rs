mod commands;
mod db;

use db::Database;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to get app data dir");
            let database = Database::new(app_data_dir).expect("failed to initialize database");
            app.manage(database);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::customer::read_customers,
            commands::inventory::read_inventory,
            commands::company::list_companies,
            commands::company::save_company,
            commands::company::delete_company,
            commands::history::list_history,
            commands::history::load_packing_list,
            commands::history::save_packing_list,
            commands::history::delete_packing_list,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::settings::load_theme_mode,
            commands::settings::save_theme_mode,
            commands::export::export_packing_list_html,
            commands::export::generate_print_html,
            commands::export::open_file,
            commands::export::export_packing_list_xlsx,
            commands::snapshot::save_form_snapshot,
            commands::snapshot::list_form_snapshots,
            commands::snapshot::load_form_snapshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
