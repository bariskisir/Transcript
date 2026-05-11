//! Domain models and constants for the transcript app.

use chrono::{DateTime, Local, Utc};
use serde::{Deserialize, Serialize};

/// Deepgram default language.
pub const DEFAULT_LANGUAGE: &str = "en-US";

/// Speaker source label.
pub const SPEAKER_LABEL: &str = "Speaker";

/// Microphone source label.
pub const MICROPHONE_LABEL: &str = "Microphone";

/// Identifies an audio source.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum AudioSourceKind {
    /// System speaker/output audio.
    Speaker,
    /// Microphone/input audio.
    Microphone,
}

impl AudioSourceKind {
    /// Returns a stable display label for the source.
    pub fn label(self) -> &'static str {
        match self {
            Self::Speaker => SPEAKER_LABEL,
            Self::Microphone => MICROPHONE_LABEL,
        }
    }
}

/// Selectable audio device shown by the UI.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AudioDevice {
    /// Stable device id.
    pub id: String,
    /// Human-readable name.
    pub name: String,
    /// Source kind.
    pub kind: AudioSourceKind,
    /// Whether this is the default device.
    pub is_default: bool,
    /// Whether the app can capture from this device.
    pub is_available: bool,
}

/// One Deepgram language option.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct LanguageOption {
    /// Deepgram language code.
    pub value: &'static str,
    /// UI label.
    pub label: &'static str,
    /// Optional model override.
    pub model: Option<&'static str>,
}

/// Saved transcript record.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptRecord {
    /// Transcript id.
    pub id: String,
    /// Created timestamp.
    pub created_at: DateTime<Utc>,
    /// Updated timestamp.
    pub updated_at: DateTime<Utc>,
    /// Selected language.
    pub language: String,
    /// Final segments.
    pub segments: Vec<TranscriptSegment>,
}

impl TranscriptRecord {
    /// Returns list label in dd.MM - HH:mm format.
    pub fn list_label(&self) -> String {
        let timestamp = if self.is_empty() {
            self.created_at
        } else {
            self.updated_at
        };
        timestamp
            .with_timezone(&Local)
            .format("%d.%m - %H:%M")
            .to_string()
    }

    /// Returns true when no final segment has been saved.
    pub fn is_empty(&self) -> bool {
        self.segments.is_empty()
    }
}

/// Saved final transcript segment.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscriptSegment {
    /// Segment id.
    pub id: i64,
    /// Source label.
    pub source: String,
    /// Final text.
    pub text: String,
    /// Created timestamp.
    pub created_at: DateTime<Utc>,
}

/// Persisted app settings.
///
/// Serialized as camelCase for the frontend. Aliases preserve backwards
/// compatibility with existing snake_case `settings.json` files.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    /// Deepgram API key.
    #[serde(default, alias = "api_key")]
    pub api_key: String,
    /// Selected speaker device id.
    #[serde(default, alias = "speaker_device_id")]
    pub speaker_device_id: String,
    /// Selected microphone device id.
    #[serde(default, alias = "microphone_device_id")]
    pub microphone_device_id: String,
    /// Deepgram language code.
    #[serde(default)]
    pub language: String,
    /// Whether speaker source is enabled.
    #[serde(default = "default_enabled", alias = "speaker_enabled")]
    pub speaker_enabled: bool,
    /// Whether microphone source is enabled.
    #[serde(default = "default_enabled", alias = "microphone_enabled")]
    pub microphone_enabled: bool,
    /// Whether the main window should stay above other windows.
    #[serde(default, alias = "always_on_top")]
    pub always_on_top: bool,
    /// Active transcript id.
    #[serde(default, alias = "active_transcript_id")]
    pub active_transcript_id: String,
}

/// Returns the default enabled state for audio source settings.
fn default_enabled() -> bool {
    true
}

/// Deepgram API key status.
#[derive(Clone, Debug)]
pub struct DeepgramAccountStatus {
    /// Whether the key was accepted.
    pub valid: bool,
    /// User-facing message.
    pub message: String,
    /// Optional balance label.
    pub balance_label: String,
}

/// Returns the supported Deepgram language list.
pub fn language_options() -> Vec<LanguageOption> {
    vec![
        LanguageOption {
            value: "en-US",
            label: "English",
            model: None,
        },
        LanguageOption {
            value: "tr",
            label: "Turkish",
            model: None,
        },
        LanguageOption {
            value: "multi",
            label: "Multilingual",
            model: None,
        },
        LanguageOption {
            value: "ar",
            label: "Arabic",
            model: None,
        },
        LanguageOption {
            value: "de",
            label: "German",
            model: None,
        },
        LanguageOption {
            value: "es",
            label: "Spanish",
            model: None,
        },
        LanguageOption {
            value: "fr",
            label: "French",
            model: None,
        },
        LanguageOption {
            value: "it",
            label: "Italian",
            model: None,
        },
        LanguageOption {
            value: "pt-BR",
            label: "Portuguese (Brazil)",
            model: None,
        },
        LanguageOption {
            value: "ru",
            label: "Russian",
            model: None,
        },
        LanguageOption {
            value: "zh",
            label: "Chinese (Mandarin)",
            model: None,
        },
        LanguageOption {
            value: "ja",
            label: "Japanese",
            model: None,
        },
        LanguageOption {
            value: "ko",
            label: "Korean",
            model: None,
        },
        LanguageOption {
            value: "th",
            label: "Thai",
            model: Some("nova-2"),
        },
        LanguageOption {
            value: "vi",
            label: "Vietnamese",
            model: None,
        },
    ]
}

/// Normalizes a stored language code.
pub fn normalize_language(value: &str) -> String {
    if language_options()
        .iter()
        .any(|language| language.value == value)
    {
        value.to_owned()
    } else {
        DEFAULT_LANGUAGE.to_owned()
    }
}

/// Returns the Deepgram model for a language.
pub fn model_for_language(value: &str) -> &'static str {
    language_options()
        .into_iter()
        .find(|language| language.value == value)
        .and_then(|language| language.model)
        .unwrap_or("nova-3")
}
