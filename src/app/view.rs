//! View models and data transfer types for the frontend.

use crate::domain::{AppSettings, AudioDevice, LanguageOption};
use serde::{Deserialize, Serialize};

/// UI state returned to the frontend.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppViewState {
    /// Current persisted settings.
    pub settings: AppSettings,
    /// Deepgram balance label.
    pub balance: String,
    /// Status bar message.
    pub status: String,
    /// Compact transcript list for navigation.
    pub transcripts: Vec<TranscriptSummary>,
    /// Currently selected transcript id.
    pub active_transcript_id: String,
    /// Zero-based index of the active transcript.
    pub active_index: usize,
    /// Total number of transcripts.
    pub transcript_count: usize,
    /// Rendered text of the active transcript.
    pub transcript_text: String,
    /// Available audio devices.
    pub devices: Vec<AudioDevice>,
    /// Supported Deepgram languages.
    pub languages: Vec<LanguageOption>,
    /// Whether capture is running.
    pub running: bool,
}

/// Compact transcript metadata for UI navigation.
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSummary {
    /// Transcript id.
    pub id: String,
    /// Display label.
    pub label: String,
}

/// Settings payload accepted from the frontend.
///
/// Note: API key is intentionally excluded. It can only be persisted
/// through the `test_deepgram_key` command after validation.
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FrontendSettings {
    /// Selected speaker device id.
    pub speaker_device_id: String,
    /// Selected microphone device id.
    pub microphone_device_id: String,
    /// Deepgram language code.
    pub language: String,
    /// Whether speaker source is enabled.
    pub speaker_enabled: bool,
    /// Whether microphone source is enabled.
    pub microphone_enabled: bool,
    /// Whether the main window should stay above other windows.
    pub always_on_top: bool,
}
