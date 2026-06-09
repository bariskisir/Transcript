(function () {
  const refs = {};
  const model = {
    state: null,
    interimText: "",
    compact: false,
    apiKeyDirty: false
  };

  window.transcriptBridge = {
    nextId: 1,
    pending: {},
    invoke(command, payload = {}) {
      const id = String(this.nextId++);
      const encoded = encodeURIComponent(JSON.stringify(payload));
      return new Promise((resolve, reject) => {
        this.pending[id] = { resolve, reject };
        window.location.href = `transcript://${command}?id=${encodeURIComponent(id)}&payload=${encoded}`;
      });
    },
    complete(id, ok, payload) {
      const request = this.pending[String(id)];
      if (!request) return;
      delete this.pending[String(id)];
      if (ok) request.resolve(payload);
      else request.reject(new Error(String(payload || "Command failed.")));
    }
  };

  window.transcriptApp = {
    receiveEvent(payload) {
      if (!payload) return;
      if (payload.type === "state") {
        model.interimText = "";
        renderState(payload.state);
      } else if (payload.type === "interim") {
        model.interimText = payload.text || "";
        renderTranscript();
      }
    }
  };

  document.addEventListener("DOMContentLoaded", async () => {
    bindRefs();
    bindEvents();
    renderCompact();
    await safeInvoke("ready");
  });

  function bindRefs() {
    for (const id of [
      "statusRow", "statusText", "deepgramLink", "developerLink", "sourceLink",
      "apiKeyInput", "testButton", "speakerToggle", "microphoneToggle",
      "speakerSelect", "microphoneSelect", "languageSelect", "compactButton",
      "previousButton", "nextButton", "newButton", "deleteButton", "startButton",
      "stopButton", "copyButton", "transcriptCounter", "transcriptText"
    ]) {
      refs[id] = document.getElementById(id);
      if (!refs[id]) throw new Error(`Missing DOM element: ${id}`);
    }
  }

  function bindEvents() {
    refs.deepgramLink.addEventListener("click", () => safeInvoke("openUrl", { url: "https://console.deepgram.com/" }));
    refs.developerLink.addEventListener("click", () => safeInvoke("openUrl", { url: "https://www.bariskisir.com" }));
    refs.sourceLink.addEventListener("click", () => safeInvoke("openUrl", { url: "https://github.com/bariskisir/Transcript" }));

    refs.compactButton.addEventListener("click", () => {
      model.compact = !model.compact;
      renderCompact();
    });

    refs.testButton.addEventListener("click", async () => {
      const apiKey = refs.apiKeyInput.value;
      await saveSettings();
      const result = await safeInvoke("testDeepgramKey", { apiKey });
      if (isAppState(result)) model.apiKeyDirty = false;
    });

    refs.speakerToggle.addEventListener("click", async () => {
      refs.speakerToggle.classList.toggle("is-on");
      await saveSettings();
    });

    refs.microphoneToggle.addEventListener("click", async () => {
      refs.microphoneToggle.classList.toggle("is-on");
      await saveSettings();
    });

    for (const element of [refs.speakerSelect, refs.microphoneSelect, refs.languageSelect]) {
      element.addEventListener("change", saveSettings);
    }

    refs.apiKeyInput.addEventListener("input", () => {
      model.apiKeyDirty = true;
      updateButtons();
    });
    refs.previousButton.addEventListener("click", () => navigateTranscript(-1));
    refs.nextButton.addEventListener("click", () => navigateTranscript(1));
    refs.newButton.addEventListener("click", () => safeInvoke("createTranscript"));
    refs.deleteButton.addEventListener("click", () => safeInvoke("deleteTranscript"));
    refs.startButton.addEventListener("click", async () => {
      await saveSettings();
      model.interimText = "";
      await safeInvoke("startCapture");
    });
    refs.stopButton.addEventListener("click", async () => {
      model.interimText = "";
      await safeInvoke("stopCapture");
    });
    refs.transcriptText.addEventListener("blur", () => {
      if (model.state && refs.transcriptText.value.trim() !== (model.state.transcriptText || "").trim()) {
        safeInvoke("saveTranscriptText", { text: refs.transcriptText.value });
      }
    });
    refs.copyButton.addEventListener("click", () => safeInvoke("copyText", { text: refs.transcriptText.value }).then(() => renderStatus("Transcript copied.")));
  }

  async function safeInvoke(command, payload) {
    try {
      const result = await window.transcriptBridge.invoke(command, payload || {});
      if (isAppState(result)) renderState(result);
      return result;
    } catch (error) {
      renderStatus(error.message || String(error), true);
      updateButtons();
      return null;
    }
  }

  function isAppState(value) {
    return value && typeof value === "object" && "settings" in value && "transcripts" in value;
  }

  async function saveSettings() {
    return safeInvoke("saveSettings", collectSettings());
  }

  function collectSettings() {
    return {
      speakerDeviceId: refs.speakerSelect.value,
      microphoneDeviceId: refs.microphoneSelect.value,
      language: refs.languageSelect.value,
      speakerEnabled: refs.speakerToggle.classList.contains("is-on"),
      microphoneEnabled: refs.microphoneToggle.classList.contains("is-on"),
      alwaysOnTop: false
    };
  }

  async function navigateTranscript(offset) {
    model.interimText = "";
    await safeInvoke("selectTranscriptByOffset", { offset });
  }

  function renderState(state) {
    model.state = state;
    populateOptions();
    renderStatus(state.status || "Ready.");
    setToggle(refs.speakerToggle, Boolean(state.settings.speakerEnabled));
    setToggle(refs.microphoneToggle, Boolean(state.settings.microphoneEnabled));
    renderTranscriptCounter();
    renderTranscript();
    updateButtons();
  }

  function renderStatus(message, isError = false) {
    refs.statusText.textContent = message || "Ready.";
    refs.statusRow.classList.toggle("is-error", isError);
  }

  function populateOptions() {
    const state = model.state;
    if (!state) return;
    replaceOptions(refs.languageSelect, state.languages.map(item => ({ value: item.value, label: item.label })));
    replaceOptions(refs.speakerSelect, state.devices.filter(item => item.kind === "Speaker").map(deviceOption));
    replaceOptions(refs.microphoneSelect, state.devices.filter(item => item.kind === "Microphone").map(deviceOption));
    if (!model.apiKeyDirty) refs.apiKeyInput.value = state.settings.apiKey || "";
    selectPreferred(refs.speakerSelect, state.settings.speakerDeviceId || "");
    selectPreferred(refs.microphoneSelect, state.settings.microphoneDeviceId || "");
    refs.languageSelect.value = state.settings.language || "en-US";
  }

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
    if (options.some(option => option.value === previous)) select.value = previous;
  }

  function selectPreferred(select, value) {
    if (value && Array.from(select.options).some(option => option.value === value)) {
      select.value = value;
    } else if (select.options.length > 0) {
      select.selectedIndex = 0;
    }
  }

  function deviceOption(device) {
    const suffix = device.isDefault ? " (Default)" : "";
    const unavailable = device.isAvailable ? "" : " (Unsupported)";
    const label = cleanDeviceName(device.name) || device.name || device.id;
    return {
      value: device.id,
      label: `${label}${suffix}${unavailable}`,
      title: `${device.name}${suffix}${unavailable}`
    };
  }

  function cleanDeviceName(name) {
    return String(name || "")
      .replace(/\s*\((?:Realtek\(R\)|NVIDIA|AMD|Intel\(R\)|High Definition Audio Device|USB Audio Device)[^)]+\)/gi, "")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function setToggle(element, enabled) {
    element.classList.toggle("is-on", enabled);
    element.setAttribute("aria-pressed", String(enabled));
  }

  function renderTranscriptCounter() {
    const state = model.state;
    if (!state) return;
    const count = state.transcriptCount || 0;
    const index = count ? state.activeIndex + 1 : 0;
    refs.transcriptCounter.textContent = `${index}/${count}`;
  }

  function isNearBottom(element) {
    return element.scrollHeight - element.scrollTop - element.clientHeight <= 32;
  }

  function scrollToBottom(element) {
    element.scrollTop = element.scrollHeight;
  }

  function renderTranscript() {
    const stick = isNearBottom(refs.transcriptText);
    const parts = [];
    if (model.state && model.state.transcriptText) parts.push(model.state.transcriptText.trim());
    if (model.interimText) parts.push(model.interimText.trim());
    const text = parts.filter(Boolean).join(" ");
    refs.transcriptText.value = text;
    refs.transcriptText.classList.toggle("is-empty", !text);
    if (stick) scrollToBottom(refs.transcriptText);
  }

  function updateButtons() {
    const state = model.state;
    if (!state) return;
    const running = Boolean(state.running);
    const apiKeyReady = Boolean(state.settings.apiKey && refs.apiKeyInput.value.trim() === state.settings.apiKey.trim());
    const sourceReady = refs.speakerToggle.classList.contains("is-on") || refs.microphoneToggle.classList.contains("is-on");
    refs.startButton.hidden = running;
    refs.stopButton.hidden = !running;
    refs.startButton.disabled = running || !apiKeyReady || !sourceReady;
    refs.stopButton.disabled = !running;
    refs.previousButton.disabled = running || state.activeIndex <= 0;
    refs.nextButton.disabled = running || state.activeIndex >= state.transcriptCount - 1;
    refs.newButton.disabled = running;
    refs.deleteButton.disabled = running || (state.transcriptCount === 1 && !state.transcriptText.trim());
    refs.speakerToggle.disabled = running;
    refs.microphoneToggle.disabled = running;
    refs.speakerSelect.disabled = running;
    refs.microphoneSelect.disabled = running;
    refs.languageSelect.disabled = running;
    refs.apiKeyInput.disabled = running;
    refs.testButton.disabled = running || !refs.apiKeyInput.value.trim();
    refs.copyButton.disabled = !refs.transcriptText.value.trim();
  }

  function renderCompact() {
    document.body.classList.toggle("is-compact", model.compact);
    refs.compactButton.textContent = model.compact ? "Full" : "Compact";
  }
})();
