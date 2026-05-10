//! Backend event forwarding to the Tauri frontend.

use super::state::AppState;
use super::view::AppViewState;
use crate::domain::MICROPHONE_LABEL;
use crate::infra::deepgram::DeepgramEvent;
use serde::Serialize;
use tauri::{AppHandle, Emitter};

/// Event payload emitted to the frontend.
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum UiEvent {
    /// Status text changed.
    Status { message: String },
    /// Interim transcript text arrived.
    Interim { text: String },
    /// Final transcript text was persisted.
    State { state: Box<AppViewState> },
    /// An error occurred.
    Error { message: String },
}

/// Starts forwarding Deepgram events into storage and the Tauri frontend.
///
/// Runs on a dedicated thread so the event loop never blocks the UI.
pub fn spawn_event_forwarder(
    app_handle: AppHandle,
    state: AppState,
    events_rx: crossbeam_channel::Receiver<DeepgramEvent>,
) {
    std::thread::spawn(move || {
        while let Ok(event) = events_rx.recv() {
            match event {
                DeepgramEvent::Status(message) => {
                    state.set_status(&message);
                    let _ = app_handle.emit("transcript-event", UiEvent::Status { message });
                }
                DeepgramEvent::Interim { source, text } => {
                    let text = if source == MICROPHONE_LABEL {
                        format!("{MICROPHONE_LABEL}: {text}")
                    } else {
                        text
                    };
                    let _ = app_handle.emit("transcript-event", UiEvent::Interim { text });
                }
                DeepgramEvent::Final { source, text } => {
                    if let Some(view) = state.handle_final_segment(&source, &text) {
                        let _ = app_handle.emit(
                            "transcript-event",
                            UiEvent::State {
                                state: Box::new(view),
                            },
                        );
                    }
                }
                DeepgramEvent::Error(message) => {
                    state.set_status(&message);
                    let _ = app_handle.emit("transcript-event", UiEvent::Error { message });
                }
            }
        }
    });
}
