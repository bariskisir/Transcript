//! Shared application state and business logic.

use super::capture::{CaptureSession, capture_status};
use super::transcripts::{apply_default_devices, format_transcript_text, resolve_active_id};
use super::view::{AppViewState, FrontendSettings, TranscriptSummary};
use crate::domain::{
    AppSettings, AudioDevice, DeepgramAccountStatus, TranscriptRecord, language_options,
};
use crate::infra::{audio, deepgram, paths::AppPaths, shell, storage::Storage};
use anyhow::Result;
use std::sync::{Arc, Mutex, MutexGuard};
use tokio::runtime::Runtime;

/// Shared Tauri application state.
#[derive(Clone)]
pub struct AppState {
    inner: Arc<Mutex<InnerState>>,
    runtime: Arc<Runtime>,
    events_tx: crossbeam_channel::Sender<deepgram::DeepgramEvent>,
}

/// Mutable application state guarded by a mutex.
struct InnerState {
    storage: Storage,
    settings: AppSettings,
    balance: String,
    status: String,
    transcripts: Vec<TranscriptRecord>,
    active_transcript_id: String,
    devices: Vec<AudioDevice>,
    capture: CaptureSession,
}

impl AppState {
    /// Creates application state from persisted files.
    pub fn new(
        paths: AppPaths,
    ) -> Result<(Self, crossbeam_channel::Receiver<deepgram::DeepgramEvent>)> {
        let storage = Storage::new(&paths)?;
        let mut settings = storage.load_settings()?;
        let devices = audio::list_devices();
        apply_default_devices(&mut settings, &devices);

        let mut transcripts = storage.load_transcripts()?;
        if transcripts.is_empty() {
            transcripts.push(storage.create_transcript(&settings.language)?);
        }

        let active_transcript_id = resolve_active_id(&settings, &transcripts);
        settings.active_transcript_id = active_transcript_id.clone();
        storage.save_settings(&settings)?;

        let (events_tx, events_rx) = crossbeam_channel::unbounded();
        let state = Self {
            inner: Arc::new(Mutex::new(InnerState {
                storage,
                settings,
                balance: String::new(),
                status: "Ready.".to_owned(),
                transcripts,
                active_transcript_id,
                devices,
                capture: CaptureSession::new(),
            })),
            runtime: Arc::new(Runtime::new()?),
            events_tx,
        };
        Ok((state, events_rx))
    }

    // ── Public methods used by commands ──────────────────────────────

    /// Returns a serializable view state.
    pub fn view_state(&self) -> Result<AppViewState> {
        let inner = self.lock()?;
        Ok(inner.build_view())
    }

    /// Saves frontend settings (excludes API key).
    pub fn save_frontend_settings(&self, input: FrontendSettings) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        inner.settings.speaker_device_id = input.speaker_device_id;
        inner.settings.microphone_device_id = input.microphone_device_id;
        inner.settings.language = input.language;
        inner.settings.speaker_enabled = input.speaker_enabled;
        inner.settings.microphone_enabled = input.microphone_enabled;
        inner.settings.active_transcript_id = inner.active_transcript_id.clone();
        if inner.capture.is_running() {
            let settings = inner.settings.clone();
            inner
                .capture
                .reconcile(&settings, &self.runtime, &self.events_tx)?;
            inner.status = capture_status(&inner.settings, true);
        }
        inner.storage.save_settings(&inner.settings)?;
        Ok(inner.build_view())
    }

    /// Tests and saves a Deepgram API key after validation.
    pub async fn test_and_save_key(&self, api_key: String) -> Result<AppViewState> {
        let result: DeepgramAccountStatus = deepgram::test_key_and_balance(&api_key).await?;
        let mut inner = self.lock()?;
        inner.status = result.message;
        inner.balance = result.balance_label;
        if result.valid {
            inner.settings.api_key = api_key;
            inner.storage.save_settings(&inner.settings)?;
        }
        Ok(inner.build_view())
    }

    /// Creates a new transcript.
    pub fn create_transcript(&self) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        if inner.capture.is_running() {
            return Ok(inner.build_view());
        }
        let transcript = inner.storage.create_transcript(&inner.settings.language)?;
        inner.active_transcript_id = transcript.id.clone();
        inner.transcripts.push(transcript);
        inner.sync_active_id_to_settings()?;
        Ok(inner.build_view())
    }

    /// Deletes the active transcript when allowed.
    pub fn delete_transcript(&self) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        if inner.capture.is_running() {
            return Ok(inner.build_view());
        }
        let Some(active) = inner.active_transcript().cloned() else {
            return Ok(inner.build_view());
        };
        if inner.transcripts.len() == 1 && active.is_empty() {
            inner.status = "The last empty transcript cannot be deleted.".to_owned();
            return Ok(inner.build_view());
        }
        inner.storage.delete_transcript(&active.id)?;
        inner.reload_transcripts()?;
        if inner.transcripts.is_empty() {
            let transcript = inner.storage.create_transcript(&inner.settings.language)?;
            inner.active_transcript_id = transcript.id.clone();
            inner.transcripts.push(transcript);
        } else {
            inner.active_transcript_id = inner
                .transcripts
                .first()
                .map(|item| item.id.clone())
                .unwrap_or_default();
        }
        inner.sync_active_id_to_settings()?;
        Ok(inner.build_view())
    }

    /// Selects a transcript by relative offset.
    pub fn select_transcript_by_offset(&self, offset: isize) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        if inner.capture.is_running() {
            return Ok(inner.build_view());
        }
        let Some(index) = inner.active_transcript_index() else {
            return Ok(inner.build_view());
        };
        let next = index as isize + offset;
        if next < 0 || next >= inner.transcripts.len() as isize {
            return Ok(inner.build_view());
        }
        if let Some(transcript) = inner.transcripts.get(next as usize) {
            inner.active_transcript_id = transcript.id.clone();
            inner.sync_active_id_to_settings()?;
        }
        Ok(inner.build_view())
    }

    /// Starts the selected capture sources.
    pub fn start_capture(&self) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        if inner.capture.is_running() {
            return Ok(inner.build_view());
        }
        if inner.settings.api_key.trim().is_empty() {
            inner.status = "Enter and test a Deepgram API key first.".to_owned();
            return Ok(inner.build_view());
        }
        if !inner.settings.microphone_enabled && !inner.settings.speaker_enabled {
            inner.status = "Turn Speaker or Mic on before starting.".to_owned();
            return Ok(inner.build_view());
        }
        inner.sync_active_id_to_settings()?;
        let settings = inner.settings.clone();
        inner
            .capture
            .start(&settings, &self.runtime, &self.events_tx)?;
        inner.status = capture_status(&inner.settings, true);
        Ok(inner.build_view())
    }

    /// Stops all capture sources.
    pub fn stop_capture(&self) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        inner.stop_capture();
        Ok(inner.build_view())
    }

    /// Refreshes audio devices.
    pub fn refresh_devices(&self) -> Result<AppViewState> {
        let mut inner = self.lock()?;
        inner.devices = audio::list_devices();
        Ok(inner.build_view())
    }

    /// Opens the Deepgram dashboard in the user's default browser.
    pub fn open_deepgram_site(&self) -> Result<()> {
        shell::open_url("https://console.deepgram.com/")
    }

    /// Opens the developer website in the user's default browser.
    pub fn open_developer_site(&self) -> Result<()> {
        shell::open_url("https://www.bariskisir.com")
    }

    /// Opens the source repository in the user's default browser.
    pub fn open_source_site(&self) -> Result<()> {
        shell::open_url("https://github.com/bariskisir/Transcript")
    }

    // ── Methods used by event forwarder ─────────────────────────────

    /// Updates the status message.
    pub fn set_status(&self, message: &str) {
        if let Ok(mut inner) = self.lock() {
            inner.status = message.to_owned();
        }
    }

    /// Appends a final segment and returns the updated view.
    pub fn handle_final_segment(&self, source: &str, text: &str) -> Option<AppViewState> {
        match self.lock() {
            Ok(mut inner) => {
                let active_id = inner.active_transcript_id.clone();
                if let Err(error) = inner.storage.append_segment(&active_id, source, text) {
                    inner.status = error.to_string();
                    None
                } else if let Err(error) = inner.reload_transcripts() {
                    inner.status = error.to_string();
                    None
                } else {
                    Some(inner.build_view())
                }
            }
            Err(_) => None,
        }
    }

    // ── Private helpers ─────────────────────────────────────────────

    /// Locks the inner state.
    fn lock(&self) -> Result<MutexGuard<'_, InnerState>> {
        self.inner
            .lock()
            .map_err(|_| anyhow::anyhow!("App state lock failed"))
    }
}

// ── InnerState helpers ──────────────────────────────────────────────

impl InnerState {
    /// Returns the active transcript.
    fn active_transcript(&self) -> Option<&TranscriptRecord> {
        self.transcripts
            .iter()
            .find(|item| item.id == self.active_transcript_id)
    }

    /// Returns the active transcript index.
    fn active_transcript_index(&self) -> Option<usize> {
        self.transcripts
            .iter()
            .position(|item| item.id == self.active_transcript_id)
    }

    /// Reloads transcript files from storage.
    fn reload_transcripts(&mut self) -> Result<()> {
        self.transcripts = self.storage.load_transcripts()?;
        Ok(())
    }

    /// Persists the current active transcript id into settings.
    fn sync_active_id_to_settings(&mut self) -> Result<()> {
        self.settings.active_transcript_id = self.active_transcript_id.clone();
        self.storage.save_settings(&self.settings)
    }

    /// Stops all active capture resources.
    fn stop_capture(&mut self) {
        self.capture.stop();
        self.status = "Stopped.".to_owned();
    }

    /// Returns serializable view state.
    fn build_view(&self) -> AppViewState {
        let active_index = self.active_transcript_index().unwrap_or(0);
        let transcript_text = self
            .active_transcript()
            .map(format_transcript_text)
            .unwrap_or_default();
        AppViewState {
            settings: self.settings.clone(),
            balance: self.balance.clone(),
            status: self.status.clone(),
            transcripts: self
                .transcripts
                .iter()
                .map(|item| TranscriptSummary {
                    id: item.id.clone(),
                    label: item.list_label(),
                })
                .collect(),
            active_transcript_id: self.active_transcript_id.clone(),
            active_index,
            transcript_count: self.transcripts.len(),
            transcript_text,
            devices: self.devices.clone(),
            languages: language_options(),
            running: self.capture.is_running(),
        }
    }
}

// ── Free functions ──────────────────────────────────────────────────
