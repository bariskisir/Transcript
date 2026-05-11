/** Typed DOM lookup for the Transcript UI. */

namespace TranscriptDom {
  export interface DomRefs {
    statusRow: HTMLElement;
    statusText: HTMLElement;
    deepgramLink: HTMLElement;
    developerLink: HTMLButtonElement;
    sourceLink: HTMLButtonElement;
    apiKeyInput: HTMLInputElement;
    testButton: HTMLButtonElement;
    speakerToggle: HTMLElement;
    microphoneToggle: HTMLElement;
    speakerSelect: HTMLSelectElement;
    microphoneSelect: HTMLSelectElement;
    languageSelect: HTMLSelectElement;
    previousButton: HTMLButtonElement;
    nextButton: HTMLButtonElement;
    newButton: HTMLButtonElement;
    deleteButton: HTMLButtonElement;
    startButton: HTMLButtonElement;
    stopButton: HTMLButtonElement;
    copyButton: HTMLButtonElement;
    transcriptCounter: HTMLElement;
    transcriptMeta: HTMLElement;
    transcriptText: HTMLElement;
  }

  export function getRefs(): DomRefs {
    return {
      statusRow: requireElement("statusRow"),
      statusText: requireElement("statusText"),
      deepgramLink: requireElement("deepgramLink"),
      developerLink: requireElement<HTMLButtonElement>("developerLink"),
      sourceLink: requireElement<HTMLButtonElement>("sourceLink"),
      apiKeyInput: requireElement<HTMLInputElement>("apiKeyInput"),
      testButton: requireElement<HTMLButtonElement>("testButton"),
      speakerToggle: requireElement("speakerToggle"),
      microphoneToggle: requireElement("microphoneToggle"),
      speakerSelect: requireElement<HTMLSelectElement>("speakerSelect"),
      microphoneSelect: requireElement<HTMLSelectElement>("microphoneSelect"),
      languageSelect: requireElement<HTMLSelectElement>("languageSelect"),
      previousButton: requireElement<HTMLButtonElement>("previousButton"),
      nextButton: requireElement<HTMLButtonElement>("nextButton"),
      newButton: requireElement<HTMLButtonElement>("newButton"),
      deleteButton: requireElement<HTMLButtonElement>("deleteButton"),
      startButton: requireElement<HTMLButtonElement>("startButton"),
      stopButton: requireElement<HTMLButtonElement>("stopButton"),
      copyButton: requireElement<HTMLButtonElement>("copyButton"),
      transcriptCounter: requireElement("transcriptCounter"),
      transcriptMeta: requireElement("transcriptMeta"),
      transcriptText: requireElement("transcriptText"),
    };
  }

  function requireElement<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = document.getElementById(id);
    if (!element) {
      throw new Error(`Missing DOM element: ${id}`);
    }
    return element as T;
  }
}
