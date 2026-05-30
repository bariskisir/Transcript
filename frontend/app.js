"use strict";
/** Typed DOM lookup for the Transcript UI. */
var TranscriptDom;
(function (TranscriptDom) {
    function getRefs() {
        return {
            statusRow: requireElement("statusRow"),
            statusText: requireElement("statusText"),
            deepgramLink: requireElement("deepgramLink"),
            apiKeyInput: requireElement("apiKeyInput"),
            testButton: requireElement("testButton"),
            speakerToggle: requireElement("speakerToggle"),
            microphoneToggle: requireElement("microphoneToggle"),
            speakerSelect: requireElement("speakerSelect"),
            microphoneSelect: requireElement("microphoneSelect"),
            languageSelect: requireElement("languageSelect"),
            previousButton: requireElement("previousButton"),
            nextButton: requireElement("nextButton"),
            newButton: requireElement("newButton"),
            deleteButton: requireElement("deleteButton"),
            startButton: requireElement("startButton"),
            stopButton: requireElement("stopButton"),
            copyButton: requireElement("copyButton"),
            transcriptCounter: requireElement("transcriptCounter"),
            transcriptMeta: requireElement("transcriptMeta"),
            transcriptText: requireElement("transcriptText"),
        };
    }
    TranscriptDom.getRefs = getRefs;
    function requireElement(id) {
        const element = document.getElementById(id);
        if (!element) {
            throw new Error(`Missing DOM element: ${id}`);
        }
        return element;
    }
})(TranscriptDom || (TranscriptDom = {}));
/** Tauri backend access for the Transcript UI. */
var TranscriptBackend;
(function (TranscriptBackend) {
    const { invoke } = window.__TAURI__.core;
    const { listen } = window.__TAURI__.event;
    function invokeCommand(command, args) {
        return invoke(command, args);
    }
    TranscriptBackend.invokeCommand = invokeCommand;
    function listenTranscriptEvents(handler) {
        return listen("transcript-event", (event) => {
            handler(event.payload);
        });
    }
    TranscriptBackend.listenTranscriptEvents = listenTranscriptEvents;
})(TranscriptBackend || (TranscriptBackend = {}));
/** Rendering and UI state helpers for Transcript. */
var TranscriptRender;
(function (TranscriptRender) {
    /** Collects current UI settings into the FrontendSettings shape. */
    function collectSettings(refs) {
        return {
            speakerDeviceId: refs.speakerSelect.value,
            microphoneDeviceId: refs.microphoneSelect.value,
            language: refs.languageSelect.value,
            speakerEnabled: refs.speakerToggle.classList.contains("is-on"),
            microphoneEnabled: refs.microphoneToggle.classList.contains("is-on"),
        };
    }
    TranscriptRender.collectSettings = collectSettings;
    /** Renders all UI fragments from state. */
    function renderState(refs, model, state) {
        model.appState = state;
        populateOptions(refs, model);
        renderStatus(refs, state.status);
        renderToggles(refs, model);
        renderTranscriptHeader(refs, model);
        renderTranscript(refs, model);
        updateButtons(refs, model);
    }
    TranscriptRender.renderState = renderState;
    /** Renders current status text. */
    function renderStatus(refs, message, isError = false) {
        refs.statusText.textContent = message || "Ready.";
        refs.statusRow.classList.toggle("is-error", isError);
    }
    TranscriptRender.renderStatus = renderStatus;
    /** Shows a temporary copied state on the copy button. */
    function renderCopyFeedback(refs, model) {
        window.clearTimeout(model.copyResetTimer);
        refs.copyButton.classList.add("is-copied");
        refs.copyButton.textContent = "copied";
        model.copyResetTimer = window.setTimeout(() => {
            refs.copyButton.classList.remove("is-copied");
            refs.copyButton.textContent = "copy";
            updateButtons(refs, model);
        }, 1200);
    }
    TranscriptRender.renderCopyFeedback = renderCopyFeedback;
    /** Renders saved and interim transcript text. */
    function renderTranscript(refs, model) {
        const parts = [];
        if (model.appState?.transcriptText) {
            parts.push(model.appState.transcriptText.trim());
        }
        if (model.interimText) {
            parts.push(model.interimText.trim());
        }
        const text = parts.filter(Boolean).join(" ");
        refs.transcriptText.textContent = text || "No transcript yet.";
        refs.transcriptText.classList.toggle("ct-empty", !text);
        refs.transcriptText.scrollTop = refs.transcriptText.scrollHeight;
    }
    TranscriptRender.renderTranscript = renderTranscript;
    /** Updates button visibility and disabled states. */
    function updateButtons(refs, model) {
        if (!model.appState)
            return;
        const running = Boolean(model.appState.running);
        const apiKeyReady = isApiKeyReady(refs, model);
        const sourceReady = refs.speakerToggle.classList.contains("is-on") ||
            refs.microphoneToggle.classList.contains("is-on");
        refs.startButton.hidden = running;
        refs.stopButton.hidden = !running;
        refs.startButton.disabled = running || !apiKeyReady || !sourceReady;
        refs.stopButton.disabled = !running;
        refs.previousButton.disabled = running || model.appState.activeIndex <= 0;
        refs.nextButton.disabled =
            running || model.appState.activeIndex >= model.appState.transcriptCount - 1;
        refs.newButton.disabled = running;
        refs.deleteButton.disabled = running || isLastEmptyTranscript(model);
        refs.languageSelect.disabled = running;
        refs.speakerSelect.disabled = running;
        refs.microphoneSelect.disabled = running;
        refs.apiKeyInput.disabled = running;
        refs.testButton.disabled = running || !refs.apiKeyInput.value.trim();
        refs.copyButton.disabled =
            !refs.transcriptText.textContent?.trim() ||
                refs.transcriptText.classList.contains("ct-empty");
    }
    TranscriptRender.updateButtons = updateButtons;
    /** Populates device and language selects. */
    function populateOptions(refs, model) {
        if (!model.appState)
            return;
        replaceOptions(refs.languageSelect, model.appState.languages.map((item) => ({
            value: item.value,
            label: item.label,
        })));
        replaceOptions(refs.speakerSelect, model.appState.devices
            .filter((item) => item.kind === "Speaker")
            .map(deviceOption));
        replaceOptions(refs.microphoneSelect, model.appState.devices
            .filter((item) => item.kind === "Microphone")
            .map(deviceOption));
        refs.apiKeyInput.value = model.appState.settings.apiKey || "";
        selectPreferredDevice(refs.speakerSelect, model.appState.settings.speakerDeviceId || "");
        selectPreferredDevice(refs.microphoneSelect, model.appState.settings.microphoneDeviceId || "");
        refs.languageSelect.value = model.appState.settings.language || "en-US";
    }
    /** Selects a saved device or falls back to the first option. */
    function selectPreferredDevice(select, savedValue) {
        if (savedValue &&
            Array.from(select.options).some((option) => option.value === savedValue)) {
            select.value = savedValue;
            return;
        }
        if (select.options.length > 0) {
            select.selectedIndex = 0;
        }
    }
    /** Replaces select options without preserving stale values. */
    function replaceOptions(select, options) {
        const previous = select.value;
        select.innerHTML = "";
        for (const option of options) {
            const element = document.createElement("option");
            element.value = option.value;
            element.textContent = option.label;
            element.title = option.title || option.label;
            select.appendChild(element);
        }
        if (options.some((option) => option.value === previous)) {
            select.value = previous;
        }
    }
    /** Creates a select option from an audio device. */
    function deviceOption(device) {
        const suffix = device.isDefault ? " (Default)" : "";
        const label = cleanDeviceName(device.name) || device.name || device.id;
        return {
            value: device.id,
            label: `${label}${suffix}`,
            title: `${device.name}${suffix}`,
        };
    }
    /** Removes noisy Windows endpoint suffixes from device names. */
    function cleanDeviceName(name) {
        return String(name || "")
            .replace(/\s*\((?:Realtek\(R\)|NVIDIA|AMD|Intel\(R\)|High Definition Audio Device|USB Audio Device)[^)]+\)/gi, "")
            .replace(/\s{2,}/g, " ")
            .trim();
    }
    /** Renders toggle state. */
    function renderToggles(refs, model) {
        if (!model.appState)
            return;
        setToggle(refs.speakerToggle, Boolean(model.appState.settings.speakerEnabled));
        setToggle(refs.microphoneToggle, Boolean(model.appState.settings.microphoneEnabled));
    }
    /** Sets one switch visual state. */
    function setToggle(element, enabled) {
        element.classList.toggle("is-on", enabled);
        element.setAttribute("aria-pressed", String(enabled));
    }
    /** Renders transcript header metadata. */
    function renderTranscriptHeader(refs, model) {
        if (!model.appState)
            return;
        const count = model.appState.transcriptCount || 0;
        const index = count ? model.appState.activeIndex + 1 : 0;
        refs.transcriptCounter.textContent = `${index}/${count}`;
        const active = model.appState.transcripts[model.appState.activeIndex];
        refs.transcriptMeta.textContent = active
            ? active.label
            : "No transcript selected";
    }
    /** Returns true when the visible key matches the last tested and saved key. */
    function isApiKeyReady(refs, model) {
        const saved = model.appState?.settings?.apiKey || "";
        return Boolean(saved.trim()) && refs.apiKeyInput.value.trim() === saved.trim();
    }
    /** Returns true when the only transcript has no saved text. */
    function isLastEmptyTranscript(model) {
        const state = model.appState;
        if (!state)
            return false;
        return state.transcriptCount === 1 && !state.transcriptText.trim();
    }
})(TranscriptRender || (TranscriptRender = {}));
/** Tauri frontend for live transcription controls and transcript rendering. */
var TranscriptApp;
(function (TranscriptApp) {
    const refs = TranscriptDom.getRefs();
    const model = {
        appState: null,
        interimText: "",
    };
    document.addEventListener("DOMContentLoaded", async () => {
        bindEvents();
        await bindBackendEvents();
        await refreshState();
    });
    /** Wires UI controls to Tauri commands. */
    function bindEvents() {
        refs.deepgramLink.addEventListener("click", () => {
            void safeInvoke("open_deepgram_site");
        });
        refs.testButton.addEventListener("click", async () => {
            const attemptedKey = refs.apiKeyInput.value;
            await safeInvoke("save_settings", {
                settings: TranscriptRender.collectSettings(refs),
            });
            const state = await safeInvoke("test_deepgram_key", {
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
            const state = await safeInvoke("create_transcript");
            if (state)
                TranscriptRender.renderState(refs, model, state);
        });
        refs.deleteButton.addEventListener("click", async () => {
            model.interimText = "";
            const state = await safeInvoke("delete_transcript");
            if (state)
                TranscriptRender.renderState(refs, model, state);
        });
        refs.startButton.addEventListener("click", async () => {
            await safeInvoke("save_settings", {
                settings: TranscriptRender.collectSettings(refs),
            });
            model.interimText = "";
            const state = await safeInvoke("start_capture");
            if (state)
                TranscriptRender.renderState(refs, model, state);
        });
        refs.stopButton.addEventListener("click", async () => {
            model.interimText = "";
            const state = await safeInvoke("stop_capture");
            if (state)
                TranscriptRender.renderState(refs, model, state);
        });
        refs.copyButton.addEventListener("click", async () => {
            const text = refs.transcriptText.textContent?.trim();
            if (!text)
                return;
            try {
                await navigator.clipboard.writeText(text);
                TranscriptRender.renderCopyFeedback(refs, model);
                TranscriptRender.renderStatus(refs, "Transcript copied.");
            }
            catch (error) {
                TranscriptRender.renderStatus(refs, `Copy failed: ${error}`, true);
            }
        });
    }
    /** Registers backend event listeners. */
    async function bindBackendEvents() {
        await TranscriptBackend.listenTranscriptEvents((payload) => {
            if (payload.type === "status") {
                TranscriptRender.renderStatus(refs, payload.message);
            }
            else if (payload.type === "interim") {
                model.interimText = payload.text || "";
                TranscriptRender.renderTranscript(refs, model);
            }
            else if (payload.type === "state") {
                model.interimText = "";
                TranscriptRender.renderState(refs, model, payload.state);
            }
            else if (payload.type === "error") {
                TranscriptRender.renderStatus(refs, payload.message, true);
            }
        });
    }
    /** Safely invokes a Tauri command, catching and displaying errors. */
    async function safeInvoke(command, args) {
        try {
            return await TranscriptBackend.invokeCommand(command, args);
        }
        catch (error) {
            TranscriptRender.renderStatus(refs, String(error), true);
            TranscriptRender.updateButtons(refs, model);
            return null;
        }
    }
    /** Fetches current state from Rust. */
    async function refreshState() {
        const state = await safeInvoke("get_app_state");
        if (state)
            TranscriptRender.renderState(refs, model, state);
    }
    /** Navigates to a transcript by offset. */
    async function navigateTranscript(offset) {
        model.interimText = "";
        const state = await safeInvoke("select_transcript_by_offset", {
            offset,
        });
        if (state)
            TranscriptRender.renderState(refs, model, state);
    }
    /** Saves settings and renders returned state. */
    async function saveSettingsAndRender() {
        const state = await safeInvoke("save_settings", {
            settings: TranscriptRender.collectSettings(refs),
        });
        if (state)
            TranscriptRender.renderState(refs, model, state);
    }
})(TranscriptApp || (TranscriptApp = {}));
