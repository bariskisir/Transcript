/// <reference path="./types.d.ts" />
/// <reference path="./dom.ts" />
/// <reference path="./backend.ts" />
/// <reference path="./render.ts" />

/** Tauri frontend for live transcription controls and transcript rendering. */

namespace TranscriptApp {
  const refs = TranscriptDom.getRefs();
  const model: TranscriptRender.UiModel = {
    appState: null,
    interimText: "",
  };

  document.addEventListener("DOMContentLoaded", async () => {
    bindEvents();
    await bindBackendEvents();
    await refreshState();
  });

  /** Wires UI controls to Tauri commands. */
  function bindEvents(): void {
    refs.deepgramLink.addEventListener("click", () => {
      void safeInvoke("open_deepgram_site");
    });

    refs.developerLink.addEventListener("click", () => {
      void safeInvoke("open_developer_site");
    });

    refs.sourceLink.addEventListener("click", () => {
      void safeInvoke("open_source_site");
    });

    refs.testButton.addEventListener("click", async () => {
      const attemptedKey = refs.apiKeyInput.value;
      await safeInvoke("save_settings", {
        settings: TranscriptRender.collectSettings(refs),
      });
      const state = await safeInvoke<AppViewState>("test_deepgram_key", {
        apiKey: refs.apiKeyInput.value,
      });
      if (state) {
        TranscriptRender.renderState(refs, model, state);
        refs.apiKeyInput.value = attemptedKey;
        TranscriptRender.updateButtons(refs, model);
      }
    });

    refs.speakerToggle.addEventListener("click", async () => {
      refs.speakerToggle.classList.toggle("is-on");
      await saveSettingsAndRender();
    });

    refs.microphoneToggle.addEventListener("click", async () => {
      refs.microphoneToggle.classList.toggle("is-on");
      await saveSettingsAndRender();
    });

    refs.apiKeyInput.addEventListener("input", () => {
      TranscriptRender.updateButtons(refs, model);
    });

    for (const element of [
      refs.speakerSelect,
      refs.microphoneSelect,
      refs.languageSelect,
    ]) {
      element.addEventListener("change", saveSettingsAndRender);
    }

    refs.previousButton.addEventListener("click", () => navigateTranscript(-1));
    refs.nextButton.addEventListener("click", () => navigateTranscript(1));

    refs.newButton.addEventListener("click", async () => {
      model.interimText = "";
      const state = await safeInvoke<AppViewState>("create_transcript");
      if (state) TranscriptRender.renderState(refs, model, state);
    });

    refs.deleteButton.addEventListener("click", async () => {
      model.interimText = "";
      const state = await safeInvoke<AppViewState>("delete_transcript");
      if (state) TranscriptRender.renderState(refs, model, state);
    });

    refs.startButton.addEventListener("click", async () => {
      await safeInvoke("save_settings", {
        settings: TranscriptRender.collectSettings(refs),
      });
      model.interimText = "";
      const state = await safeInvoke<AppViewState>("start_capture");
      if (state) TranscriptRender.renderState(refs, model, state);
    });

    refs.stopButton.addEventListener("click", async () => {
      model.interimText = "";
      const state = await safeInvoke<AppViewState>("stop_capture");
      if (state) TranscriptRender.renderState(refs, model, state);
    });

    refs.copyButton.addEventListener("click", async () => {
      const text = refs.transcriptText.textContent?.trim();
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        TranscriptRender.renderCopyFeedback(refs, model);
        TranscriptRender.renderStatus(refs, "Transcript copied.");
      } catch (error) {
        TranscriptRender.renderStatus(refs, `Copy failed: ${error}`, true);
      }
    });
  }

  /** Registers backend event listeners. */
  async function bindBackendEvents(): Promise<void> {
    await TranscriptBackend.listenTranscriptEvents((payload) => {
      if (payload.type === "status") {
        TranscriptRender.renderStatus(refs, payload.message);
      } else if (payload.type === "interim") {
        model.interimText = payload.text || "";
        TranscriptRender.renderTranscript(refs, model);
      } else if (payload.type === "state") {
        model.interimText = "";
        TranscriptRender.renderState(refs, model, payload.state);
      } else if (payload.type === "error") {
        TranscriptRender.renderStatus(refs, payload.message, true);
      }
    });
  }

  /** Safely invokes a Tauri command, catching and displaying errors. */
  async function safeInvoke<T = void>(
    command: string,
    args?: Record<string, unknown>
  ): Promise<T | null> {
    try {
      return await TranscriptBackend.invokeCommand<T>(command, args);
    } catch (error) {
      TranscriptRender.renderStatus(refs, String(error), true);
      TranscriptRender.updateButtons(refs, model);
      return null;
    }
  }

  /** Fetches current state from Rust. */
  async function refreshState(): Promise<void> {
    const state = await safeInvoke<AppViewState>("get_app_state");
    if (state) TranscriptRender.renderState(refs, model, state);
  }

  /** Navigates to a transcript by offset. */
  async function navigateTranscript(offset: number): Promise<void> {
    model.interimText = "";
    const state = await safeInvoke<AppViewState>("select_transcript_by_offset", {
      offset,
    });
    if (state) TranscriptRender.renderState(refs, model, state);
  }

  /** Saves settings and renders returned state. */
  async function saveSettingsAndRender(): Promise<void> {
    const state = await safeInvoke<AppViewState>("save_settings", {
      settings: TranscriptRender.collectSettings(refs),
    });
    if (state) TranscriptRender.renderState(refs, model, state);
  }
}
