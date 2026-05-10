//! JSON file persistence for transcripts and settings.

use crate::domain::{AppSettings, DEFAULT_LANGUAGE, TranscriptRecord, TranscriptSegment};
use crate::infra::paths::AppPaths;
use anyhow::{Context, Result};
use chrono::Utc;
use std::fs;
use std::path::PathBuf;

/// File-backed repository for settings and transcripts.
#[derive(Clone, Debug)]
pub struct Storage {
    settings: PathBuf,
    transcripts: PathBuf,
}

impl Storage {
    /// Creates a repository and ensures required folders exist.
    pub fn new(paths: &AppPaths) -> Result<Self> {
        fs::create_dir_all(&paths.data_dir).context("Could not create app data directory")?;
        fs::create_dir_all(&paths.transcripts)
            .context("Could not create transcript data directory")?;
        Ok(Self {
            settings: paths.settings.clone(),
            transcripts: paths.transcripts.clone(),
        })
    }

    /// Loads saved settings from settings.json.
    pub fn load_settings(&self) -> Result<AppSettings> {
        if !self.settings.exists() {
            return Ok(default_settings());
        }
        let text = fs::read_to_string(&self.settings).context("Could not read settings.json")?;
        let mut settings: AppSettings =
            serde_json::from_str(&text).context("Could not parse settings.json")?;
        if settings.language.is_empty() {
            settings.language = DEFAULT_LANGUAGE.to_owned();
        }
        Ok(settings)
    }

    /// Saves settings to settings.json.
    pub fn save_settings(&self, settings: &AppSettings) -> Result<()> {
        let text =
            serde_json::to_string_pretty(settings).context("Could not serialize settings")?;
        fs::write(&self.settings, text).context("Could not write settings.json")?;
        Ok(())
    }

    /// Loads all transcript JSON files.
    pub fn load_transcripts(&self) -> Result<Vec<TranscriptRecord>> {
        let mut transcripts = Vec::new();
        for entry in fs::read_dir(&self.transcripts).context("Could not read transcript data")? {
            let entry = entry?;
            let path = entry.path();
            if path.extension().and_then(|value| value.to_str()) != Some("json") {
                continue;
            }
            let text = fs::read_to_string(&path)
                .with_context(|| format!("Could not read transcript file {}", path.display()))?;
            match serde_json::from_str::<TranscriptRecord>(&text) {
                Ok(transcript) => transcripts.push(transcript),
                Err(error) => log::error!("Could not parse transcript {}: {error}", path.display()),
            }
        }
        transcripts.sort_by_key(|transcript| transcript.created_at);
        Ok(transcripts)
    }

    /// Creates a new transcript JSON file.
    pub fn create_transcript(&self, language: &str) -> Result<TranscriptRecord> {
        let now = Utc::now();
        let transcript = TranscriptRecord {
            id: format!(
                "{}-{}",
                now.timestamp_millis(),
                now.timestamp_subsec_nanos()
            ),
            language: language.to_owned(),
            created_at: now,
            updated_at: now,
            segments: Vec::new(),
        };
        self.save_transcript(&transcript)?;
        Ok(transcript)
    }

    /// Deletes a transcript JSON file.
    pub fn delete_transcript(&self, transcript_id: &str) -> Result<()> {
        let path = self.transcript_path(transcript_id);
        if path.exists() {
            fs::remove_file(&path)
                .with_context(|| format!("Could not delete transcript {}", path.display()))?;
        }
        Ok(())
    }

    /// Appends a final transcript segment to a transcript JSON file.
    pub fn append_segment(&self, transcript_id: &str, source: &str, text: &str) -> Result<()> {
        let mut transcript = self
            .load_transcript(transcript_id)?
            .with_context(|| format!("Transcript {transcript_id} was not found"))?;
        let now = Utc::now();
        transcript.segments.push(TranscriptSegment {
            id: transcript.segments.len() as i64 + 1,
            source: source.to_owned(),
            text: text.trim().to_owned(),
            created_at: now,
        });
        transcript.updated_at = now;
        self.save_transcript(&transcript)
    }

    /// Loads one transcript by id.
    fn load_transcript(&self, transcript_id: &str) -> Result<Option<TranscriptRecord>> {
        let path = self.transcript_path(transcript_id);
        if !path.exists() {
            return Ok(None);
        }
        let text = fs::read_to_string(&path)
            .with_context(|| format!("Could not read transcript {}", path.display()))?;
        let transcript =
            serde_json::from_str(&text).context("Could not parse transcript JSON file")?;
        Ok(Some(transcript))
    }

    /// Saves one transcript JSON file.
    fn save_transcript(&self, transcript: &TranscriptRecord) -> Result<()> {
        let path = self.transcript_path(&transcript.id);
        let text =
            serde_json::to_string_pretty(transcript).context("Could not serialize transcript")?;
        fs::write(&path, text)
            .with_context(|| format!("Could not write transcript {}", path.display()))?;
        Ok(())
    }

    /// Returns the JSON path for a transcript id.
    fn transcript_path(&self, transcript_id: &str) -> PathBuf {
        self.transcripts.join(format!("{transcript_id}.json"))
    }
}

/// Returns default settings for a first run.
fn default_settings() -> AppSettings {
    AppSettings {
        language: DEFAULT_LANGUAGE.to_owned(),
        speaker_enabled: true,
        microphone_enabled: true,
        ..Default::default()
    }
}
