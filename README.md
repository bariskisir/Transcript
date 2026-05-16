# Transcript

Transcript is a minimal desktop application that captures speaker and microphone audio and transcribes speech in real time using [Deepgram](https://deepgram.com).

Chrome Extension -> https://github.com/bariskisir/ChromeTranscript

![Transcript interface](images/interface.png)

---

## Install

1. Download the latest release for your platform from [Releases](https://github.com/bariskisir/transcript/releases/latest).
2. Install or extract the package.
3. Run **Transcript**.

## Development

#### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- Platform build tools (Visual Studio Build Tools on Windows)


```bash
git clone https://github.com/bariskisir/transcript.git
cd transcript

cd frontend
npm install
npm run build
cd ..

cargo run
```

## License

MIT
