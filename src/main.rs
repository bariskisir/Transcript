//! Starts the Tauri desktop transcript application.

#![cfg_attr(target_os = "windows", windows_subsystem = "windows")]

mod app;
mod domain;
mod infra;

use anyhow::Result;
use app::{
    AppState, create_transcript, delete_transcript, get_app_state, open_deepgram_site,
    open_developer_site, open_source_site, refresh_devices, save_settings,
    select_transcript_by_offset, spawn_event_forwarder, start_capture, stop_capture,
    test_deepgram_key,
};
use infra::paths::app_paths;

/// Configures logging, persistence, and launches the Tauri window.
fn main() -> Result<()> {
    let paths = app_paths()?;
    infra::logging::install_logger(paths.log_file.clone())?;
    log::info!(
        "Transcript Tauri application starting; data_dir={}",
        paths.data_dir.display()
    );
    let (state, events_rx) = AppState::new(paths)?;
    let managed_state = state.clone();

    tauri::Builder::default()
        .manage(managed_state)
        .setup(move |app| {
            spawn_event_forwarder(app.handle().clone(), state.clone(), events_rx);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_app_state,
            save_settings,
            test_deepgram_key,
            create_transcript,
            delete_transcript,
            select_transcript_by_offset,
            start_capture,
            stop_capture,
            refresh_devices,
            open_deepgram_site,
            open_developer_site,
            open_source_site
        ])
        .run(tauri::generate_context!())
        .map_err(|error| anyhow::anyhow!(error.to_string()))?;

    log::info!("Transcript Tauri application stopped");
    Ok(())
}
