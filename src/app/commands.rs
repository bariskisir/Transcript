//! Tauri command handlers.
//!
//! Each command is a thin wrapper that delegates to [`AppState`] methods
//! and maps errors to strings for the Tauri IPC boundary.

use super::state::AppState;
use super::view::{AppViewState, FrontendSettings};
use tauri::State;

/// Shorthand for Tauri command results.
type CommandResult<T> = std::result::Result<T, String>;

/// Returns the current app state.
#[tauri::command]
pub fn get_app_state(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.view_state().map_err(|error| error.to_string())
}

/// Saves settings from the frontend.
#[tauri::command]
pub fn save_settings(
    settings: FrontendSettings,
    state: State<'_, AppState>,
) -> CommandResult<AppViewState> {
    state
        .save_frontend_settings(settings)
        .map_err(|error| error.to_string())
}

/// Tests and saves the Deepgram API key.
#[tauri::command]
pub async fn test_deepgram_key(
    api_key: String,
    state: State<'_, AppState>,
) -> CommandResult<AppViewState> {
    state
        .test_and_save_key(api_key)
        .await
        .map_err(|error| error.to_string())
}

/// Creates a new transcript.
#[tauri::command]
pub fn create_transcript(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.create_transcript().map_err(|error| error.to_string())
}

/// Deletes the active transcript.
#[tauri::command]
pub fn delete_transcript(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.delete_transcript().map_err(|error| error.to_string())
}

/// Moves to the previous or next transcript.
#[tauri::command]
pub fn select_transcript_by_offset(
    offset: isize,
    state: State<'_, AppState>,
) -> CommandResult<AppViewState> {
    state
        .select_transcript_by_offset(offset)
        .map_err(|error| error.to_string())
}

/// Starts audio capture.
#[tauri::command]
pub fn start_capture(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.start_capture().map_err(|error| error.to_string())
}

/// Stops audio capture.
#[tauri::command]
pub fn stop_capture(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.stop_capture().map_err(|error| error.to_string())
}

/// Refreshes available audio devices.
#[tauri::command]
pub fn refresh_devices(state: State<'_, AppState>) -> CommandResult<AppViewState> {
    state.refresh_devices().map_err(|error| error.to_string())
}

/// Opens the Deepgram dashboard in the user's default browser.
#[tauri::command]
pub fn open_deepgram_site(state: State<'_, AppState>) -> CommandResult<()> {
    state
        .open_deepgram_site()
        .map_err(|error| error.to_string())
}

/// Opens the developer website in the user's default browser.
#[tauri::command]
pub fn open_developer_site(state: State<'_, AppState>) -> CommandResult<()> {
    state
        .open_developer_site()
        .map_err(|error| error.to_string())
}

/// Opens the source repository in the user's default browser.
#[tauri::command]
pub fn open_source_site(state: State<'_, AppState>) -> CommandResult<()> {
    state.open_source_site().map_err(|error| error.to_string())
}
