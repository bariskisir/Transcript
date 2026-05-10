//! Application layer: state management, Tauri commands, and event forwarding.

mod capture;
mod commands;
mod events;
pub mod state;
mod transcripts;
mod view;

pub use commands::{
    create_transcript, delete_transcript, get_app_state, open_deepgram_site, refresh_devices,
    save_settings, select_transcript_by_offset, start_capture, stop_capture, test_deepgram_key,
};
pub use events::spawn_event_forwarder;
pub use state::AppState;
