/** Tauri backend access for the Transcript UI. */

import type { UiEventPayload } from "./types";

const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

export function invokeCommand<T = void>(
  command: string,
  args?: Record<string, unknown>
): Promise<T> {
  return invoke<T>(command, args);
}

export function listenTranscriptEvents(
  handler: (payload: UiEventPayload) => void
): Promise<() => void> {
  return listen<UiEventPayload>("transcript-event", (event) => {
    handler(event.payload);
  });
}
