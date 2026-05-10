/** Shared type definitions mirroring Rust backend view models. */

interface AppSettings {
  apiKey: string;
  speakerDeviceId: string;
  microphoneDeviceId: string;
  language: string;
  speakerEnabled: boolean;
  microphoneEnabled: boolean;
  activeTranscriptId: string;
}

interface TranscriptSummary {
  id: string;
  label: string;
}

interface AudioDevice {
  id: string;
  name: string;
  kind: "Speaker" | "Microphone";
  isDefault: boolean;
  isAvailable: boolean;
}

interface LanguageOption {
  value: string;
  label: string;
  model: string | null;
}

interface AppViewState {
  settings: AppSettings;
  balance: string;
  status: string;
  transcripts: TranscriptSummary[];
  activeTranscriptId: string;
  activeIndex: number;
  transcriptCount: number;
  transcriptText: string;
  devices: AudioDevice[];
  languages: LanguageOption[];
  running: boolean;
}

interface FrontendSettings {
  speakerDeviceId: string;
  microphoneDeviceId: string;
  language: string;
  speakerEnabled: boolean;
  microphoneEnabled: boolean;
}

interface SelectOption {
  value: string;
  label: string;
  title?: string;
}

type UiEventPayload =
  | { type: "status"; message: string }
  | { type: "interim"; text: string }
  | { type: "state"; state: AppViewState }
  | { type: "error"; message: string };
