/** Shared type definitions mirroring Rust backend view models. */

export interface AppSettings {
  apiKey: string;
  speakerDeviceId: string;
  microphoneDeviceId: string;
  language: string;
  speakerEnabled: boolean;
  microphoneEnabled: boolean;
  alwaysOnTop: boolean;
  activeTranscriptId: string;
}

export interface TranscriptSummary {
  id: string;
  label: string;
}

export interface AudioDevice {
  id: string;
  name: string;
  kind: "Speaker" | "Microphone";
  isDefault: boolean;
  isAvailable: boolean;
}

export interface LanguageOption {
  value: string;
  label: string;
  model: string | null;
}

export interface AppViewState {
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

export interface FrontendSettings {
  speakerDeviceId: string;
  microphoneDeviceId: string;
  language: string;
  speakerEnabled: boolean;
  microphoneEnabled: boolean;
  alwaysOnTop: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
  title?: string;
}

export type UiEventPayload =
  | { type: "status"; message: string }
  | { type: "interim"; text: string }
  | { type: "state"; state: AppViewState }
  | { type: "error"; message: string };
